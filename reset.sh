#!/bin/sh
cd "$(dirname "$0")" || exit 1
printf "This DELETES all test data and starts fresh with the demo data. Type YES to continue: "
read ok
[ "$ok" = "YES" ] || exit 0
docker compose down -v && sh start.sh
