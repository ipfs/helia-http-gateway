# helia-http-gateway

Docker images for Helia.

## Purpose

This container image hosts helia in a node container. It implements [HTTP IPFS-gateway API](https://docs.ipfs.tech/concepts/ipfs-gateway/#gateway-types) and responds to the incoming requests using helia to fetch the content from IPFS.

## Run from the github container registry

```sh
$ docker run -it -p 8080:8080 ghcr.io/ipfs/helia-http-gateway:main
```

See https://github.com/ipfs/helia-http-gateway/pkgs/container/helia-http-gateway for more information.

## Run Using Docker Compose

```sh
$ docker-compose up
```

## Run Using Docker

### Build
```sh
$ docker build . --tag helia-http-gateway:local
```

Pass the explicit platform when building on a Mac.

```sh
$ docker build . --platform linux/arm64 --tag helia-http-gateway:local-arm64
```

### Running

```sh
$ docker run -it -p 8080:8080 -e DEBUG="helia-http-gateway*" helia-http-gateway:local # or helia-http-gateway:local-arm64
```

## Supported Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `DEBUG` | Debug level | `''`|
| `FASTIFY_DEBUG` | Debug level for fastify's logger | `''`|
| `PORT` | Port to listen on | `8080` |
| `HOST` | Host to listen on | `0.0.0.0` |
| `USE_SUBDOMAINS` | Whether to use [origin isolation](https://docs.ipfs.tech/how-to/gateway-best-practices/#use-subdomain-gateway-resolution-for-origin-isolation) | `true` |
| `METRICS` | Whether to enable prometheus metrics. Any value other than 'true' will disable metrics. | `true` |
| `USE_BITSWAP` | Use bitswap to fetch content from IPFS | `true` |
| `USE_TRUSTLESS_GATEWAYS` | Whether to fetch content from trustless-gateways or not | `true` |
| `TRUSTLESS_GATEWAYS` | Comma separated list of trusted gateways to fetch content from | [Defined in Helia](https://github.com/ipfs/helia/blob/main/packages/helia/src/block-brokers/trustless-gateway/index.ts) |
| `USE_LIBP2P` | Whether to use libp2p networking | `true` |
| `RESOLVE_REDIRECTS` | Whether to resolve redirects before looking up dnslink entries | `true` |

<!--
TODO: currently broken when used in docker, but they work when running locally (you can cache datastore and blockstore locally to speed things up if you want)
| `FILE_DATASTORE_PATH` | Path to use with a datastore-level passed to Helia as the datastore | `null`; memory datastore is used by default. |
| `FILE_BLOCKSTORE_PATH` | Path to use with a blockstore-level passed to Helia as the blockstore | `null`; memory blockstore is used by default. |
-->

See the source of truth for all `process.env.<name>` environment variables at [src/constants.ts](src/constants.ts).

### Running with custom configurations

Note that any of the following calls to docker can be replaced with something like `MY_ENV_VAR="MY_VALUE" npm run start`

#### Disable libp2p
```sh
$ docker run -it -p $PORT:8080 -e DEBUG="helia-http-gateway*" -e USE_LIBP2P="false" helia
```

#### Disable bitswap
```sh
$ docker run -it -p $PORT:8080 -e DEBUG="helia-http-gateway*" -e USE_BITSWAP="false" helia
```

#### Disable trustless gateways
```sh
$ docker run -it -p $PORT:8080 -e DEBUG="helia-http-gateway*" -e USE_TRUSTLESS_GATEWAYS="false" helia
```

#### Customize trustless gateways
```sh
$ docker run -it -p $PORT:8080 -e DEBUG="helia-http-gateway*" -e TRUSTLESS_GATEWAYS="https://ipfs.io,https://dweb.link" helia
```

<!--
#### With file datastore and blockstore

**NOTE:** Not currently supported due to docker volume? issues.

```sh
$ docker run -it -p $PORT:8080 -e DEBUG="helia-http-gateway*" -e FILE_DATASTORE_PATH="./datastore" -e FILE_BLOCKSTORE_PATH="./blockstore" helia
# and if you want to re-use a volume from your host:
$ docker run -it -p $PORT:8080 -e DEBUG="helia-http-gateway*" -e FILE_DATASTORE_PATH="./datastore" -e FILE_BLOCKSTORE_PATH="./blockstore" -v ./datastore:/datastore -v ./blockstore:/blockstore helia
```
-->

## E2E Testing

We have some tests enabled that simulate running inside of [ProbeLab's Tiros](https://github.com/plprobelab/tiros), via playwright. These tests request the same paths from ipfs.io and ensure that the resulting text matches. This is not a direct replacement for [gateway conformance testing](https://github.com/ipfs/gateway-conformance), but helps us ensure the helia-http-gateway is working as expected.

By default, these tests:

1. Run in serial
2. Allow for up to 5 failures before failing the whole suite run.
3. Have an individual test timeout of two minutes.

### Run e2e tests locally

```sh
$ npm run test:e2e # run all tests
$ npm run test:e2e -- ${PLAYWRIGHT_OPTIONS} # run tests with custom playwright options.

```

### Get clinicjs flamecharts and doctor reports from e2e tests

```sh
$ npm run test:e2e-doctor # Run the dev server with clinicjs doctor, execute e2e tests, and generate a report.
$ npm run test:e2e-flame # Run the dev server with clinicjs flame, execute e2e tests, and generate a report.
```

## Author

- [whizzzkid](https://github.com/whizzzkid)
