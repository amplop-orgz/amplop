#!/usr/bin/env bash
# Deploys the local stack to a running Anvil (S04-7). The key is Anvil's public account 0 test key.
set -euo pipefail
cd "$(dirname "$0")/.."
forge script script/LocalSetup.s.sol:LocalSetup --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
node script/write-deployment.mjs 31337
