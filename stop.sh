#!/bin/sh
cd "$(dirname "$0")" || exit 1
docker compose down && echo "Stopped. Data is kept. Run sh start.sh to start again."
