#!/usr/bin/env bash
# Checks server wallets against the Monad reserve-balance floors and the two allowances (S04-15, S04-16).
# Usage: script/check-wallets.sh <10143|31337>
# Env: MONAD_RPC_URL (or RPC_URL), FEE_SPONSOR_ADDRESS, optional DEPLOYER_ADDRESS,
#      optional TREASURY_FLOOR_MON / CARD_SERVICE_FLOOR_MON / SETTLEMENT_FLOOR_MON overrides.
set -euo pipefail

chain="${1:?usage: check-wallets.sh <10143|31337>}"
here="$(cd "$(dirname "$0")" && pwd)"
case "$chain" in
  10143) file="$here/../../deployments/monad-testnet.json"; rpc="${RPC_URL:-${MONAD_RPC_URL:?set MONAD_RPC_URL}}" ;;
  31337) file="$here/../../deployments/anvil.json"; rpc="${RPC_URL:-http://127.0.0.1:8545}"
         FEE_SPONSOR_ADDRESS="${FEE_SPONSOR_ADDRESS:-0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65}" ;; # Anvil account 4
  *) echo "unknown chain $chain" >&2; exit 2 ;;
esac

field() { node -e "process.stdout.write(String(require(process.argv[1])[process.argv[2]]))" "$file" "$1"; }
contract="$(field address)"; token="$(field token)"; decimals="$(field tokenDecimals)"
treasury="$(field treasury)"; card="$(field cardService)"; settlement="$(field settlement)"
fee="${FEE_SPONSOR_ADDRESS:?set FEE_SPONSOR_ADDRESS}"

gas_price="$(cast gas-price --rpc-url "$rpc")"
wei() { echo "$1 * 10^18 / 1" | bc; }
# 10 MON reserve + daily budget: 100 deposits x 300k gas; 500 card calls x 250k gas (S04-15 planning figures).
treasury_floor="${TREASURY_FLOOR_MON:+$(wei "$TREASURY_FLOOR_MON")}"
treasury_floor="${treasury_floor:-$(echo "$(wei 10) + 100 * 300000 * $gas_price" | bc)}"
card_floor="${CARD_SERVICE_FLOOR_MON:+$(wei "$CARD_SERVICE_FLOOR_MON")}"
card_floor="${card_floor:-$(echo "$(wei 10) + 500 * 250000 * $gas_price" | bc)}"
settlement_floor="$(wei "${SETTLEMENT_FLOOR_MON:-0.1}")"

failed=0
check() { # name, actual, floor, unit-divisor, unit
  local ok; ok="$(echo "$2 >= $3" | bc)"
  printf '%-4s %-22s %s >= %s %s\n' "$([ "$ok" = 1 ] && echo OK || echo FAIL)" "$1" \
    "$(echo "scale=4; $2 / $4" | bc)" "$(echo "scale=4; $3 / $4" | bc)" "$5"
  [ "$ok" = 1 ] || failed=1
}
mon() { cast balance "$1" --rpc-url "$rpc"; }
call() { cast call "$@" --rpc-url "$rpc" | awk '{print $1}'; }

one=$(echo "10^18" | bc)
check "fee sponsor MON" "$(mon "$fee")" "$(wei 60)" "$one" MON
check "treasury MON" "$(mon "$treasury")" "$treasury_floor" "$one" MON
check "card service MON" "$(mon "$card")" "$card_floor" "$one" MON
check "settlement MON" "$(mon "$settlement")" "$settlement_floor" "$one" MON
if [ -n "${DEPLOYER_ADDRESS:-}" ]; then
  check "deployer MON" "$(mon "$DEPLOYER_ADDRESS")" "$(wei 10)" "$one" MON
fi

unit=$(echo "10^$decimals" | bc)
check "treasury AUSD" "$(call "$token" "balanceOf(address)(uint256)" "$treasury")" "$(echo "20000 * $unit" | bc)" "$unit" AUSD

max="115792089237316195423570985008687907853269984665640564039457584007913129639935"
for who in treasury settlement; do
  a="$(call "$token" "allowance(address,address)(uint256)" "${!who}" "$contract")"
  if [ "$a" = "$max" ]; then echo "OK   $who allowance       max"; else echo "FAIL $who allowance       $a"; failed=1; fi
done

exit "$failed"
