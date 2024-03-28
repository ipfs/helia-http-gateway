#!/usr/bin/env bash

# If this is not executed from the root of the helia-http-gateway repository, then exit with non-zero error code
if [ ! -f "package.json" ]; then
  echo "This script must be executed from the root of the helia-http-gateway repository"
  exit 1
fi

# You have to pass `DEBUG=" " to disable debugging when using this script`
export DEBUG=${DEBUG:-"helia-http-gateway,helia-http-gateway:server,helia-http-gateway:*:helia-fetch"}
export PORT=${PORT:-8080}

gateway_already_running=false
if nc -z localhost $PORT; then
  echo "gateway is already running"
  gateway_already_running=true
fi

start_gateway() {
  if [ "$gateway_already_running" = true ]; then
    echo "gateway is already running"
    return
  fi
  npm run build

  # npx clinic doctor --open=false -- node dist/src/index.js &
  node dist/src/index.js &
  # echo "process id: $!"
}
start_gateway & process_pid=$!

ensure_gateway_running() {
  npx wait-on "tcp:$PORT" -t 5000 || exit 1
}


cleanup_called=false
cleanup() {
  if [ "$cleanup_called" = true ]; then
    echo "cleanup already called"
    return
  fi
  # kill $process_pid
  # when we're done, ensure the process is killed by sending a SIGTEM
  # kill -s SIGTERM $process_pid
  # kill any process listening on $PORT
  # fuser -k $PORT/tcp
  # kill any process listening on $PORT with SIGTERM

  if [ "$gateway_already_running" != true ]; then
    kill -s SIGINT $(lsof -i :$PORT -t)
    return
  fi

  exit 1
}

trap cleanup SIGINT
trap cleanup SIGTERM

# if we get a non-zero exit code, we know the server is no longer listening
# we should also exit early after 4 loops
# iterations=0
# max_loops=1
while [ $? -ne 1 ]; do
#   # iterations=$((iterations+1))
#   if [ $iterations -gt $max_loops ]; then
#     echo "exiting after $max_loops loops"
#     break
#   fi
  ensure_gateway_running
  ./debugging/test-gateways.sh 30 2>&1 | tee -a debugging/test-gateways.log
done

cleanup
