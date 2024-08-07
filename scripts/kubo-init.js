/**
 * This is part of the gateway conformance testing of helia-http-gateway. See ../DEVELOPER-NOTES.md for more details.
 */

import { writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, basename, relative } from 'node:path'
import debug from 'debug'
import { $ } from 'execa'
import { glob } from 'glob'

const log = debug('kubo-init')
const error = log.extend('error')
debug.enable('kubo-init*')

const kuboFilePath = './scripts/tmp/kubo-path.txt'
const GWC_FIXTURES_PATH = `${dirname(kuboFilePath)}/fixtures`
const GWC_DOCKER_IMAGE = process.env.GWC_DOCKER_IMAGE ?? 'ghcr.io/ipfs/gateway-conformance:v0.5.0'

async function main () {
  await $`mkdir -p ${dirname(kuboFilePath)}`

  const tmpDir = await writeKuboMetaData()

  await attemptKuboInit(tmpDir)

  await configureKubo(tmpDir)

  const ipfsNsMap = await loadFixtures(tmpDir)
  // execute the daemon
  const execaOptions = getExecaOptions({ tmpDir, ipfsNsMap })
  log('Starting Kubo daemon...')
  await $(execaOptions)`npx kubo daemon --offline`
}

/**
 *
 * @param {Record<string, string>} param0
 * @param {string} param0.tmpDir
 * @param {string} [param0.cwd]
 * @param {string} [param0.ipfsNsMap]
 *
 * @returns {import('execa').Options}
 */
function getExecaOptions ({ cwd, ipfsNsMap, tmpDir }) {
  return {
    cwd,
    env: {
      IPFS_PATH: tmpDir,
      IPFS_NS_MAP: ipfsNsMap
    }
  }
}

async function attemptKuboInit (tmpDir) {
  const execaOptions = getExecaOptions({ tmpDir })
  try {
    await $(execaOptions)`npx -y kubo init --profile test`
    log('Kubo initialized at %s', tmpDir)
  } catch (e) {
    if (!e.stderr.includes('already exists!')) {
      throw e
    }
    log('Kubo was already initialized at %s', tmpDir)
  }
}

async function writeKuboMetaData () {
  let tmpDir
  try {
    const currentIpfsPath = await readFile('./scripts/tmp/kubo-path.txt', 'utf-8')
    log('Existing kubo path found at %s', currentIpfsPath)
    tmpDir = currentIpfsPath
  } catch (e) {
    error('Failed to read Kubo path from %s', kuboFilePath, e)
    tmpDir = tmpdir() + '/kubo-tmp'
    log('Using temporary Kubo path at %s', tmpDir)
  }
  try {
    await writeFile(kuboFilePath, tmpDir)
  } catch (e) {
    error('Failed to save Kubo path to %s', kuboFilePath, e)
  }
  return tmpDir
}

async function configureKubo (tmpDir) {
  const execaOptions = getExecaOptions({ tmpDir })
  try {
    await $(execaOptions)`npx -y kubo config Addresses.Gateway /ip4/127.0.0.1/tcp/${process.env.KUBO_PORT ?? 8081}`
    await $(execaOptions)`npx -y kubo config --json Bootstrap ${JSON.stringify([])}`
    await $(execaOptions)`npx -y kubo config --json Swarm.DisableNatPortMap true`
    await $(execaOptions)`npx -y kubo config --json Discovery.MDNS.Enabled false`
    await $(execaOptions)`npx -y kubo config --json Gateway.NoFetch true`
    await $(execaOptions)`npx -y kubo config --json Gateway.ExposeRoutingAPI true`
    await $(execaOptions)`npx -y kubo config --json Gateway.HTTPHeaders.Access-Control-Allow-Origin ${JSON.stringify(['*'])}`
    await $(execaOptions)`npx -y kubo config --json Gateway.HTTPHeaders.Access-Control-Allow-Methods ${JSON.stringify(['GET', 'POST', 'PUT', 'OPTIONS'])}`
    log('Kubo configured')
  } catch (e) {
    error('Failed to configure Kubo', e)
  }
}

async function downloadFixtures () {
  log('Downloading fixtures to %s using %s', GWC_FIXTURES_PATH, GWC_DOCKER_IMAGE)
  try {
    await $`docker run -v ${process.cwd()}:/workspace -w /workspace ${GWC_DOCKER_IMAGE} extract-fixtures --directory ${GWC_FIXTURES_PATH} --merged false`
  } catch (e) {
    error('Error downloading fixtures, assuming current or previous success', e)
  }
}

async function loadFixtures (tmpDir) {
  await downloadFixtures()
  const execaOptions = getExecaOptions({ tmpDir })

  for (const carFile of await glob([`${GWC_FIXTURES_PATH}/**/*.car`])) {
    log('Loading *.car fixture %s', carFile)
    const { stdout } = await $(execaOptions)`npx kubo dag import --pin-roots=false --offline ${carFile}`
    stdout.split('\n').forEach(log)
  }

  for (const ipnsRecord of await glob([`${GWC_FIXTURES_PATH}/**/*.ipns-record`])) {
    const key = basename(ipnsRecord, '.ipns-record')
    const relativePath = relative(GWC_FIXTURES_PATH, ipnsRecord)
    log('Loading *.ipns-record fixture %s', relativePath)
    const { stdout } = await $(({ ...execaOptions }))`cd ${GWC_FIXTURES_PATH} && npx kubo routing put --allow-offline "/ipns/${key}" "${relativePath}"`
    stdout.split('\n').forEach(log)
  }

  const json = await readFile(`${GWC_FIXTURES_PATH}/dnslinks.json`, 'utf-8')
  const { subdomains, domains } = JSON.parse(json)
  const subdomainDnsLinks = Object.entries(subdomains).map(([key, value]) => `${key}.example.com:${value}`).join(',')
  const domainDnsLinks = Object.entries(domains).map(([key, value]) => `${key}:${value}`).join(',')
  const ipfsNsMap = `${domainDnsLinks},${subdomainDnsLinks}`

  return ipfsNsMap
}

main().catch(e => {
  error(e)
  process.exit(1)
})
