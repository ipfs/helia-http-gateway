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
# You can also set up the kubo backing node with the instructions at https://github.com/ipfs/gateway-conformance/blob/main/docs/development.md#developing-against-kubo

# terminal 2
# you will need to stop and start this one in-between code changes. It's not watching for changes
$ DEBUG="helia-http-gateway*" FILE_DATASTORE_PATH=./tmp/datastore npm run test:gwc-helia

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
1. The gateway-conformance tests are flaky and commands & documentation are not up to date. Running commands with CLI flags is supposed to work, and env vars aren't documented, but ENV_VARs are the only way to get the tests to run, but not when ran with docker. See [this issue](https://github.com/ipfs/gateway-conformance/issues/185#issuecomment-1839801366)


## Tiros info

### Deploying to Tiros

Go to https://github.com/plprobelab/probelab-infra/blob/main/aws/tf/tiros.tf

update helia stuff

run terraform apply (with AWS Config)

### Kick off helia-http-gateway task manually:

1. https://us-west-1.console.aws.amazon.com/ecs/v2/clusters/prod-usw1-ecs-cluster/run-task?region=us-west-1
1. select launch type FARGATE
1. select deployment configuration application type to be task
1. select task-helia family
1. select vpc (non-default)
1. select security group for tiros
1. Click create

### Todo

- [ ] Fix helia_health_cmd (https://github.com/plprobelab/probelab-infra/blob/7ec47f16e84113545cdb06b07f865a3bc5787a0b/aws/tf/tiros.tf#L5C4-L5C4) to use the new helia-health command
- [ ] fix node max memory for helia-http-gateway docker container to support at least 4GB

### Links

graphs for runs are at https://probelab.grafana.net/d/GpwxraxVk/tiros-ops?orgId=1&from=now-7d&to=now&inspect=8&inspectTab=error
AWS logs for runs are at https://us-west-1.console.aws.amazon.com/cloudwatch/home?region=us-west-1#logsV2:log-groups/log-group/prod-usw1-cmi-tiros-ipfs (you need to be logged in to AWS)

