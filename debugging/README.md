This file documents some methods used for debugging and testing of helia-http-gateway.

Any files in this directory should be considered temporary and may be deleted at any time.

You should also run any of these scripts from the repository root.

# Scripts

## test-gateways.sh
This script is used to test the gateways. It assumes you have booted up the `helia-http-gateway` via docker or otherwise and will query the gateway for the same websites listed at https://probelab.io/websites/#time-to-first-byte-using-kubo, outputting HTTP status codes and response times.

*Example*
```sh
./debugging/test-gateways.sh
```

## until-death.sh
This script will start up the gateway and run the `test-gateway.sh` script until the gateway dies. This is useful for load-testing helia-http-gateway in a similar manner to how it will be used by https://github.com/plprobelab/tiros

*Example*
```sh
./debugging/until-death.sh
```

# Debugging the docker container

## Setup

First, build the docker container. This will tag the container as `helia-http-gateway:local-<arch>` (or `helia-http-gateway:local-arm64` on M1 macOS) and will be used in the following examples.

```sh
USE_SUBDOMAINS=true USE_REDIRECTS=false docker build . --platform linux/$(arch) --tag helia-http-gateway:local-$(arch)
``````

Then we need to start the container

```sh
docker run -it -p 5001:5001 -p 8080:8080 -e DEBUG="helia-http-gateway*" helia-http-gateway:local-$(arch)
# or
docker run -it -p 5001:5001 -p 8080:8080 -e DEBUG="helia-http-gateway*" -e USE_REDIRECTS="false" -e USE_SUBDOMAINS="true" helia-http-gateway:local-$(arch)
```

## Running tests against the container

Then you just need to execute one of the debugging scripts:

```sh
npm run debug:until-death # continuous testing until the container dies (hopefully it doesn't)
npm run debug:test-gateways # one round of testing all the websites tiros will test.
```

# Profiling in chrome/chromium devtools

## Setup

1. Start the process

```sh
# in terminal 1
npm run start:inspect
```

2. Open `chrome://inspect` and click the 'inspect' link for the process you just started
  * it should say something like `dist/src/index.js file:///Users/sgtpooki/code/work/protocol.ai/ipfs/helia-http-gateway/dist/src/index.js` with an 'inspect' link below it.

3. In the inspector, click the `performance` or `memory` tab and start recording.

## Execute the operations that will be profiled:

1. In another terminal, run

```sh
# in terminal 2
npm run debug:test-gateways # or npm run debug:until-death
```

2. Stop recording in the inspector and analyze the results.
