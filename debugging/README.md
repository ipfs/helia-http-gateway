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
