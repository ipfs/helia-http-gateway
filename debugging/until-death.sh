#!/usr/bin/env bash

# If this is not executed from the root of the helia-http-gateway repository, then exit with non-zero error code
if [ ! -f "package.json" ]; then
  echo "This script must be executed from the root of the helia-http-gateway repository"
  exit 1
fi

# You have to pass `DEBUG=" " to disable debugging when using this script`
export DEBUG=${DEBUG:-"helia-http-gateway,helia-http-gateway:server,helia-http-gateway:*:helia-fetch"}
export HTTP_PORT=${HTTP_PORT:-8080}
export RPC_PORT=${RPC_PORT:-5001}
EXIT_CODE=0

cleanup_until_death_called=false
cleanup_until_death() {
  if [ "$cleanup_until_death_called" = true ]; then
    echo "cleanup_until_death_called already called"
    return
  fi
  echo "cleanup_until_death called"
  cleanup_until_death_called=true
  if [ "$gateway_already_running" != true ]; then
    lsof -i TCP:$HTTP_PORT | grep LISTEN | awk '{print $2}' | xargs --no-run-if-empty kill -9

    echo "waiting for the gateway to exit"
    npx wait-on "tcp:$HTTP_PORT" -t 10000 -r # wait for the port to be released
  fi


  exit $EXIT_CODE
}

trap cleanup_until_death EXIT

# Before starting, output all env vars that helia-http-gateway uses
echo "DEBUG=$DEBUG"
echo "FASTIFY_DEBUG=$FASTIFY_DEBUG"
echo "HTTP_PORT=$HTTP_PORT"
echo "RPC_PORT=$RPC_PORT"
echo "HOST=$HOST"
echo "USE_SUBDOMAINS=$USE_SUBDOMAINS"
echo "METRICS=$METRICS"
echo "USE_BITSWAP=$USE_BITSWAP"
echo "USE_TRUSTLESS_GATEWAYS=$USE_TRUSTLESS_GATEWAYS"
echo "TRUSTLESS_GATEWAYS=$TRUSTLESS_GATEWAYS"
echo "USE_LIBP2P=$USE_LIBP2P"
echo "ECHO_HEADERS=$ECHO_HEADERS"
echo "USE_DELEGATED_ROUTING=$USE_DELEGATED_ROUTING"
echo "DELEGATED_ROUTING_V1_HOST=$DELEGATED_ROUTING_V1_HOST"
echo "FILE_DATASTORE_PATH=$FILE_DATASTORE_PATH"
echo "FILE_BLOCKSTORE_PATH=$FILE_BLOCKSTORE_PATH"
echo "ALLOW_UNHANDLED_ERROR_RECOVERY=$ALLOW_UNHANDLED_ERROR_RECOVERY"

gateway_already_running=false
if nc -z localhost $HTTP_PORT; then
  echo "gateway is already running"
  gateway_already_running=true
fi

start_gateway() {
  if [ "$gateway_already_running" = true ]; then
    echo "gateway is already running"
    return
  fi
  # if DEBUG_NO_BUILD is set, then we assume the gateway is already built
  if [ "$DEBUG_NO_BUILD" != true ]; then
    npm run build
  fi
  echo "starting gateway..."
  # npx clinic doctor --open=false -- node dist/src/index.js &
  (node --trace-warnings dist/src/index.js) &
  process_id=$!
  # echo "process id: $!"
  npx wait-on "tcp:$HTTP_PORT" -t 10000 || {
    EXIT_CODE=1
    cleanup_until_death
  }
}
start_gateway

ensure_gateway_running() {
  npx wait-on "tcp:$HTTP_PORT" -t 5000 || {
    EXIT_CODE=1
    cleanup_until_death
  }
}

max_timeout=${1:-15}
while [ $? -ne 1 ]; do
  ensure_gateway_running
  ./debugging/test-gateways.sh $max_timeout # 2>&1 | tee -a debugging/test-gateways.log
done

cleanup_until_death
