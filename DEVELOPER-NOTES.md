# Developer notes

<!-- toc -->

## Gateway Conformance testing

We have some code enabled that makes running gateway-conformance testing against helia-http-gateway easy. Follow the instructions in this section to run gateway-conformance tests locally

### Prerequisites

1. [Install docker](https://docs.docker.com/get-docker/)
2. [Install nodejs](https://nodejs.org/en/download/)

### Run gateway-conformance tests locally (once)

```sh
$ npm run test:gwc
```

### Continuously develop while running gateway-conformance tests

```sh
# terminal 1
$ npm run test:gwc-kubo

# terminal 2
$ npm run test:gwc-helia # you will need to stop and start this one in-between code changes. It's not watching for changes

# terminal 3
$ npm run test:gwc

# OR from the gateway-conformance repo directly with something like:
go run ./cmd/gateway-conformance/main.go test --gateway-url 'http://localhost:8090' --subdomain-url 'http://localhost:8090' --specs subdomain-ipfs-gateway,subdomain-ipns-gateway --json gwc-report.json -- -timeout 30m

```



### Some callouts

1. You may want to run the gateway-conformance tests directly from the repo if you're on a macOS M1 due to some issues with docker and the proxying that the gateway-conformance testing tool uses. If you do this, you'll need to run `make gateway-conformance` in the `gateway-conformance` repo root, and then run the tests with something like `go run ./cmd/gateway-conformance/main.go test --gateway-url 'http://localhost:8090' --subdomain-url 'http://localhost:8090' --specs subdomain-ipfs-gateway,subdomain-ipns-gateway --json gwc-report.json -- -timeout 30m`.
    - If you want to run a specific test, you can pass the `-run` gotest flag. e.g. `go run ./cmd/gateway-conformance/main.go test --gateway-url 'http://localhost:8090' --subdomain-url 'http://localhost:8090' --json gwc-report.json -- -timeout 30m -run 'TestGatewaySubdomains/request_for_example.com%2Fipfs%2F%7BCIDv1%7D_redirects_to_subdomain_%28HTTP_proxy_tunneling_via_CONNECT%29#01'`
1. The file `./scripts/kubo-init.js` executes kubo using `execa` instead of `ipfsd-ctl` so there may be some gotchas, but it should be as cross-platform and stable as the `execa` library.
1. The IPFS_PATH used is a temporary directory. Your OS should handle removing it when vital, but you can also remove it manually. The path to this directory is printed out when the tests start, and saved in a file at `./scripts/tmp/kubo-path.txt`.
1. The tests save gateway-conformance fixtures to `./scripts/tmp/fixtures`. You can remove this directory manually if you want to re-run the tests with a fresh set of fixtures.
1. The results of the gateway-conformance tests are saved to `./gwc-report.json`. This file is overwritten every time the tests are run.
