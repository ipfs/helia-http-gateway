# Developer notes

<!-- toc -->

## Gateway Conformance testing

We have some code enabled that makes running gateway-conformance testing against helia-http-gateway easy. Follow the instructions in this section to run gateway-conformance tests locally

### Prerequisites

1. [Install docker](https://docs.docker.com/get-docker/)
2. [Install nodejs](https://nodejs.org/en/download/)

### Run gateway-conformance tests locally

```sh
$ npm run test:gwc
```

### Some callouts

1. The file `./scripts/kubo-init.js` executes kubo using `execa` instead of `ipfsd-ctl` so there may be some gotchas, but it should be as cross-platform and stable as the `execa` library.
1. The IPFS_PATH used is a temporary directory. Your OS should handle removing it when vital, but you can also remove it manually. The path to this directory is printed out when the tests start, and saved in a file at `./scripts/tmp/kubo-path.txt`.
1. The tests save gateway-conformance fixtures to `./scripts/tmp/fixtures`. You can remove this directory manually if you want to re-run the tests with a fresh set of fixtures.
1. The results of the gateway-conformance tests are saved to `./gwc-report.json`. This file is overwritten every time the tests are run.
