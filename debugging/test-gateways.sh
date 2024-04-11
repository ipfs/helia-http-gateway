#!/usr/bin/env bash

EXIT_CODE=0
cleanup_gateway_test_called=false
cleanup_gateway_test() {
  if [ "$cleanup_gateway_test_called" = true ]; then
    echo "cleanup_gateway_test already called"
    return
  fi
  echo "cleanup_gateway_test called"
  cleanup_gateway_test_called=true

  exit $EXIT_CODE
}

trap cleanup_gateway_test EXIT

# Query all endpoints until failure
# This script is intended to be run from the root of the helia-http-gateway repository

HTTP_PORT=${HTTP_PORT:-8080}
RPC_PORT=${RPC_PORT:-5001}
# If localhost:$HTTP_PORT is not listening, then exit with non-zero error code
if ! nc -z localhost $HTTP_PORT; then
  echo "localhost:$HTTP_PORT is not listening"
  exit 1
fi

ensure_gateway_running() {
  npx wait-on "tcp:$HTTP_PORT" -t 1000 || {
    EXIT_CODE=1
    cleanup_gateway_test
  }
}

# Use the first argument to this script (if any) as the maximum timeout for curl
max_timeout=${1:-60}
test_website() {
  ensure_gateway_running
  local website=$1
  echo "Requesting $website"
  curl -m $max_timeout -s --no-progress-meter -o /dev/null -w "%{url}: HTTP_%{http_code} in %{time_total} seconds (TTFB: %{time_starttransfer}, redirect: %{time_redirect})\n" -L $website
  echo "running GC"
  curl -X POST -m $max_timeout -s --no-progress-meter -o /dev/null -w "%{url}: HTTP_%{http_code} in %{time_total} seconds\n" http://localhost:$RPC_PORT/api/v0/repo/gc
}

test_website http://localhost:$HTTP_PORT/ipns/blog.ipfs.tech

test_website  http://localhost:$HTTP_PORT/ipns/blog.libp2p.io

test_website  http://localhost:$HTTP_PORT/ipns/consensuslab.world

test_website  http://localhost:$HTTP_PORT/ipns/docs.ipfs.tech

test_website  http://localhost:$HTTP_PORT/ipns/docs.libp2p.io

# test_website  http://localhost:$HTTP_PORT/ipns/drand.love #drand.love is not publishing dnslink records

test_website  http://localhost:$HTTP_PORT/ipns/fil.org

test_website  http://localhost:$HTTP_PORT/ipns/filecoin.io

test_website  http://localhost:$HTTP_PORT/ipns/green.filecoin.io

test_website http://localhost:$HTTP_PORT/ipns/ipfs.tech

test_website  http://localhost:$HTTP_PORT/ipns/ipld.io

test_website  http://localhost:$HTTP_PORT/ipns/libp2p.io

test_website  http://localhost:$HTTP_PORT/ipns/n0.computer

test_website  http://localhost:$HTTP_PORT/ipns/probelab.io

test_website http://localhost:$HTTP_PORT/ipns/protocol.ai

test_website http://localhost:$HTTP_PORT/ipns/research.protocol.ai

test_website http://localhost:$HTTP_PORT/ipns/singularity.storage

test_website http://localhost:$HTTP_PORT/ipns/specs.ipfs.tech

# test_website http://localhost:$HTTP_PORT/ipns/strn.network
test_website http://localhost:$HTTP_PORT/ipns/saturn.tech

test_website http://localhost:$HTTP_PORT/ipns/web3.storage

test_website http://localhost:$HTTP_PORT/ipfs/bafkreiezuss4xkt5gu256vjccx7vocoksxk77vwmdrpwoumfbbxcy2zowq # stock images 3 sec skateboarder video

test_website http://localhost:$HTTP_PORT/ipfs/bafybeidsp6fva53dexzjycntiucts57ftecajcn5omzfgjx57pqfy3kwbq # big buck bunny

test_website http://localhost:$HTTP_PORT/ipfs/bafybeiaysi4s6lnjev27ln5icwm6tueaw2vdykrtjkwiphwekaywqhcjze # wikipedia

test_website http://localhost:$HTTP_PORT/ipfs/bafybeifaiclxh6pc3bdtrrkpbvvqqxq6hz5r6htdzxaga4fikfpu2u56qi # uniswap interface

test_website http://localhost:$HTTP_PORT/ipfs/bafybeiae366charqmeewxags5b2jxtkhfmqyyagvqhrr5l7l7xfpp5ikpa # cid.ipfs.tech

test_website http://localhost:$HTTP_PORT/ipfs/bafybeiedlhslivmuj2iinnpd24ulx3fyd7cjenddbkeoxbf3snjiz3npda # docs.ipfs.tech
