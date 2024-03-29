#!/usr/bin/env bash

###
# This script is intended to be run from the root of the helia-http-gateway repository
# It will run the gateway with different configurations and measure the time it takes to run
# The results will be written to a CSV file, and runs that fail prior to the timeout are considered failed runs.
#
# Use like `./debugging/time-permutations.sh 30s 100` to execute 100 iterations of all permutations, where each permutation is run for a maximum of 30 seconds
# This command can be run to ensure that until-death is properly cleaning up after itself (starting/stopping the gateway)
#
# Realistically, you should be running something like `./debugging/time-permutations.sh 15m 100` to get some logs of failure cases like those investigated in https://github.com/ipfs/helia-http-gateway/issues/18
#

# globals.. same for all configurations
# export DEBUG="helia*,helia*:trace,libp2p*,libp2p*:trace"
export DEBUG="*,*:trace"
unset FASTIFY_DEBUG
export PORT=8080
export HOST="0.0.0.0"
export ECHO_HEADERS=false
export METRICS=true
export USE_TRUSTLESS_GATEWAYS=false # always set to false since helia-dr and helia-all are the failing cases.
export USE_BITSWAP=true # needs to be true to be able to fetch content without USE_TRUSTLESS_GATEWAYS
export ALLOW_UNHANDLED_ERROR_RECOVERY=false
unset DELEGATED_ROUTING_V1_HOST
unset TRUSTLESS_GATEWAYS

unset_all() {
  unset USE_SUBDOMAINS
  # unset USE_BITSWAP
  # unset USE_TRUSTLESS_GATEWAYS
  unset USE_LIBP2P
  unset USE_DELEGATED_ROUTING
  unset FILE_DATASTORE_PATH
  unset FILE_BLOCKSTORE_PATH
}

max_time=${1:-30m}
max_iterations=${2:-10}

mkdir -p permutation-logs
rm -rf permutation-logs/*

# Results file
results_file="results.csv"
echo "USE_SUBDOMAINS,USE_BITSWAP,USE_TRUSTLESS_GATEWAYS,USE_LIBP2P,USE_DELEGATED_ROUTING,time(max=${max_time}),successful_run" > $results_file

run_test() {

  npx wait-on "tcp:$PORT" -t 10000 -r # wait for the port to be released

  config_id="USE_SUBDOMAINS=$USE_SUBDOMAINS,USE_BITSWAP=$USE_BITSWAP,USE_TRUSTLESS_GATEWAYS=$USE_TRUSTLESS_GATEWAYS,USE_LIBP2P=$USE_LIBP2P,USE_DELEGATED_ROUTING=$USE_DELEGATED_ROUTING"
  # if we cannot get any data, we should skip this run.. we need at least USE_BITSWAP enabled, plus either USE_LIBP2P or USE_DELEGATED_ROUTING
  if [ "$USE_BITSWAP" = false ]; then
    echo "Skipping test for configuration: $config_id"
    return
  fi
  # TODO: we should also allow USE_TRUSTLESS_GATEWAYS=true, but we need to fix the issue with helia-dr and helia-all first
  if [ "$USE_LIBP2P" = false ] && [ "$USE_DELEGATED_ROUTING" = false ]; then
    echo "Skipping test for configuration: $config_id"
    return
  fi
  echo "Running test for configuration: $config_id"

  rm -f time_info_pipe
  mkfifo time_info_pipe

  # log file with config_id and timestamp
  run_log_file="permutation-logs/${USE_SUBDOMAINS}-${USE_BITSWAP}-${USE_TRUSTLESS_GATEWAYS}-${USE_LIBP2P}-${USE_DELEGATED_ROUTING}+$(date +%Y-%m-%d%H:%M:%S.%3N).log"

  # This is complicated, but we need to run the command in a subshell to be able to kill it if it takes too long, and also to get the timing information
  (timeout --signal=SIGTERM ${max_time} bash -c "time (./debugging/until-death.sh 2 &>${run_log_file})" 2>&1) &> time_info_pipe &
  subshell_pid=$!

  # Wait for the process to complete and get the timing information
  time_output=$(cat time_info_pipe)
  wait $subshell_pid
  exit_status=$? # get the exit status of the subshell

  # remove the fifo
  rm time_info_pipe
  was_successful=false
  if [ $exit_status -eq 124 ]; then
    echo "timeout occurred... (SUCCESSFUL RUN)"
    was_successful=true
    real_time="${max_time}"
    # remove the log file because the test didn't fail before the timeout
    rm $run_log_file
  else
    echo "no timeout occurred...(FAILED RUN)"
    was_successful=false

    real_time=$(echo "$time_output" | grep real | awk '{print $2}')
  fi

  # Write to file
  echo "$USE_SUBDOMAINS,$USE_BITSWAP,$USE_TRUSTLESS_GATEWAYS,$USE_LIBP2P,$USE_DELEGATED_ROUTING,$real_time,$was_successful" >> $results_file
}

main() {
  # Iterate over boolean values for a subset of environment variables
  for USE_SUBDOMAINS_VAL in true false; do
    # for USE_BITSWAP_VAL in true false; do
      # for USE_TRUSTLESS_GATEWAYS_VAL in true false; do
    for USE_LIBP2P_VAL in true false; do
      for USE_DELEGATED_ROUTING_VAL in true false; do
        unset_all

        # Export each variable
        export USE_SUBDOMAINS=$USE_SUBDOMAINS_VAL
        # export USE_BITSWAP=$USE_BITSWAP_VAL
        # export USE_TRUSTLESS_GATEWAYS=$USE_TRUSTLESS_GATEWAYS_VAL
        export USE_LIBP2P=$USE_LIBP2P_VAL
        export USE_DELEGATED_ROUTING=$USE_DELEGATED_ROUTING_VAL
        run_test
      done
    done
      # done
    # done
  done
}

cleanup_permutations_called=false
cleanup_permutations() {
  if [ "$cleanup_permutations_called" = true ]; then
    echo "cleanup_permutations already called"
    return
  fi
  echo "cleanup_permutations called"
  cleanup_permutations_called=true

  kill -s TERM $subshell_pid
  echo "sent TERM signal to subshell"
  wait $subshell_pid # wait for the process to exit

  npx wait-on "tcp:$PORT" -t 10000 -r # wait for the port to be released

  exit 1
}

trap cleanup_permutations SIGINT
trap cleanup_permutations SIGTERM

npm run build
# Tell until-death.sh not build the gateway
export DEBUG_NO_BUILD=true

for ((i = 1; i <= $max_iterations; i++))
do
  echo "Iteration $i"
  main
done

