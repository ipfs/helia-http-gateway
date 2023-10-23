# helia-http-gateway

Docker images for Helia.

## Purpose

This container image hosts helia in a node container. It implements [HTTP IPFS-gateway API](https://docs.ipfs.tech/concepts/ipfs-gateway/#gateway-types) and responds to the incoming requests using helia to fetch the content from IPFS.

## Run Using Docker Compose

```sh
$ docker-compose up
```

## Run Using Docker

### Build
```sh
$ docker build . --tag helia
```

Pass the explicit platform when building on a Mac.

```sh
$ docker build . --tag helia --platform linux/arm64
```

### Running

```sh
$ docker run -it -p 8080:8080 -e DEBUG="helia-http-gateway" helia
```

## Supported Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `DEBUG` | Debug level | `''`|
| `PORT` | Port to listen on | `8080` |
| `HOST` | Host to listen on | `0.0.0.0` |

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
