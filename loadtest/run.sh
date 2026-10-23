#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

export RATE_LIMIT_PER_MINUTE="${RATE_LIMIT_PER_MINUTE:-1000000}"
export LOGIN_IP_RATE_LIMIT_PER_MINUTE="${LOGIN_IP_RATE_LIMIT_PER_MINUTE:-1000000}"
export BID_RATE_LIMIT_PER_MINUTE="${BID_RATE_LIMIT_PER_MINUTE:-1000000}"
export BID_USER_RATE_LIMIT_PER_MINUTE="${BID_USER_RATE_LIMIT_PER_MINUTE:-1000000}"
export LOG_LEVEL="${LOG_LEVEL:-warn}"

echo 'Starting the stack with relaxed rate limits'
docker compose up -d --wait api worker web > /dev/null 2>&1

network="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}' "$(docker compose ps -q web)")"
scenarios="${*:-bids checkout}"

for scenario in $scenarios; do
  docker run --rm --network "$network" \
    -e BASE_URL=http://web \
    -e BIDDERS -e DURATION -e BUYERS -e STOCK -e VUS \
    -v "$PWD/loadtest:/scripts" \
    grafana/k6:1.0.0 run --quiet "/scripts/$scenario.js" || status=$?
done

docker compose exec -T postgres psql -U "${POSTGRES_USER:-mvm}" -d "${POSTGRES_DB:-mvm}" < loadtest/verify.sql

echo 'Restoring the default rate limits'
unset RATE_LIMIT_PER_MINUTE LOGIN_IP_RATE_LIMIT_PER_MINUTE BID_RATE_LIMIT_PER_MINUTE BID_USER_RATE_LIMIT_PER_MINUTE LOG_LEVEL
docker compose up -d --wait api worker > /dev/null 2>&1

exit "${status:-0}"
