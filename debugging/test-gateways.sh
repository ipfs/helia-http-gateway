#!/usr/bin/env bash

# Query all endpoints until failure
# This script is intended to be run from the root of the helia-http-gateway repository

PORT=${PORT:-8080}
# If localhost:$PORT is not listening, then exit with non-zero error code
if ! nc -z localhost $PORT; then
  echo "localhost:$PORT is not listening"
  exit 1
fi

ensure_gateway_running() {
  npx wait-on "tcp:$PORT" -t 1000 || exit 1
}

max_timeout=60
test_website() {
  ensure_gateway_running
  local website=$1
  echo "Requesting $website"
  curl -m $max_timeout -s --no-progress-meter -o /dev/null -w "%{url}: HTTP_%{http_code} in %{time_total} seconds (TTFB: %{time_starttransfer}, rediect: %{time_redirect})\n" -L $website
  echo "running GC"
  curl -X POST -m $max_timeout -s --no-progress-meter -o /dev/null -w "%{url}: HTTP_%{http_code} in %{time_total} seconds\n" http://localhost:$PORT/api/v0/repo/gc
}

test_website http://localhost:$PORT/ipns/blog.ipfs.tech

test_website  http://localhost:$PORT/ipns/blog.libp2p.io

test_website  http://localhost:$PORT/ipns/consensuslab.world

test_website  http://localhost:$PORT/ipns/docs.ipfs.tech

test_website  http://localhost:$PORT/ipns/docs.libp2p.io

test_website  http://localhost:$PORT/ipns/drand.love

test_website  http://localhost:$PORT/ipns/fil.org

test_website  http://localhost:$PORT/ipns/filecoin.io

test_website  http://localhost:$PORT/ipns/green.filecoin.io

test_website http://localhost:$PORT/ipns/ipfs.tech

test_website  http://localhost:$PORT/ipns/ipld.io

test_website  http://localhost:$PORT/ipns/libp2p.io

test_website  http://localhost:$PORT/ipns/n0.computer

test_website  http://localhost:$PORT/ipns/probelab.io

test_website http://localhost:$PORT/ipns/protocol.ai

test_website http://localhost:$PORT/ipns/research.protocol.ai

test_website http://localhost:$PORT/ipns/singularity.storage

test_website http://localhost:$PORT/ipns/specs.ipfs.tech

# test_website http://localhost:$PORT/ipns/strn.network
test_website http://localhost:$PORT/ipns/saturn.tech

test_website http://localhost:$PORT/ipns/web3.storage
