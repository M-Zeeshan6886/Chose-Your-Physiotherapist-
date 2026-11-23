#!/bin/sh
# Mac / Linux: starts the test version and opens the browser.
cd "$(dirname "$0")" || exit 1
echo "Choose Your Dr: starting the test version (first start takes a few minutes)..."
if ! docker compose up -d --build; then
  echo "Something went wrong. Is Docker open and running? Try again, or run: docker compose logs web --tail 50"
  exit 1
fi
echo "Waiting for the website to be ready..."
n=0
until curl -s -f http://localhost:3000/api/health >/dev/null 2>&1; do
  n=$((n+1)); [ "$n" -gt 80 ] && { echo "Website did not start. Run: docker compose logs web --tail 50"; exit 1; }
  sleep 3
done
echo "READY:  http://localhost:3000   (checklist: /test-guide, database viewer: http://localhost:8080)"
( command -v open >/dev/null && open http://localhost:3000 ) || ( command -v xdg-open >/dev/null && xdg-open http://localhost:3000 ) || true
