#!/usr/bin/env bash
# Builds the e2e server: a clean run directory and the fixture rules library baked in.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf e2e/.run
mkdir -p e2e/.run/ai e2e/.run/inbound e2e/.run/outbox e2e/.run/workflow \
  e2e/.run/aeroapi/schedules e2e/.run/aeroapi/airports e2e/.run/aeroapi/routes e2e/.run/aeroapi/flights

npm run rules:build -w @elsewhere/rules
# Whatever happens, leave the real library in dist/ for the next dev or build.
trap 'npm run rules:build -w @elsewhere/rules >/dev/null' EXIT
cp test/fixtures/rules-library.json ../../packages/rules/dist/rules.json

# `next build`, not `npm run build`: prebuild would rebuild the real library over the fixture.
npx next build
