#!/usr/bin/env bash
# Monad testnet deploy in one sitting (spec 04: S04-6 deploy, S04-11 record, S04-9 approvals, S04-16 check).
# Run it yourself, in your own terminal (not through an AI chat): it asks for the deployer keystore
# password and the Treasury and Settlement private keys. They are never echoed, stored or logged.
# Usage, from the repo root:  bash contracts/script/deploy-testnet.sh
set -euo pipefail
cd "$(dirname "$0")/.." # contracts/

lower() { tr 'A-F' 'a-f' <<<"$1"; }

# The wallets and token for the demo deployment. Addresses are public; no key is in this file.
DEPLOYER_ACCOUNT="amplop-deployer" # Foundry keystore name
DEPLOYER_ADDRESS="$(lower 0xf977f34db8a986a0a9edec3e744092c715ef793c)"
FEE_SPONSOR_ADDRESS="$(lower 0x1b074eFDDbdB5E75368340a1dbb23f9535cC3D93)"
export TREASURY_ADDRESS="$(lower 0xAA56c1D96160D3d290204C1B156B857CAa198bc5)"
export CARD_SERVICE_ADDRESS="$(lower 0x4C1ce63Dfa4036970CC26B0d9caFcF6821EB2eB6)"
export SETTLEMENT_ADDRESS="$(lower 0xc22A14fB5166A595B887EeA1A8744A1Ec1B5A28F)"
export AUSD_ADDRESS="$(lower 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC)"
export DEMO_MODE=true
export MONAD_RPC_URL="${MONAD_RPC_URL:-https://testnet-rpc.monad.xyz}"
export TOKEN_SOURCE="${TOKEN_SOURCE:?set TOKEN_SOURCE to the Agora docs page that lists the AUSD testnet address}"
export FEE_SPONSOR_ADDRESS DEPLOYER_ADDRESS

rpc=(--rpc-url "$MONAD_RPC_URL")
say() { printf '\n== %s\n' "$1"; }

say "1/5 Checks (read-only)"
[ "$(cast chain-id "${rpc[@]}")" = "10143" ] || { echo "MONAD_RPC_URL is not Monad testnet (10143)" >&2; exit 1; }
[ "$(cast code "$AUSD_ADDRESS" "${rpc[@]}")" != "0x" ] || { echo "no contract at the AUSD address" >&2; exit 1; }
decimals="$(cast call "$AUSD_ADDRESS" 'decimals()(uint8)' "${rpc[@]}")"
echo "token:       $(cast call "$AUSD_ADDRESS" 'symbol()(string)' "${rpc[@]}"), $decimals decimals"
for w in DEPLOYER_ADDRESS TREASURY_ADDRESS CARD_SERVICE_ADDRESS SETTLEMENT_ADDRESS FEE_SPONSOR_ADDRESS; do
  printf '%-21s %s MON\n' "$w" "$(cast balance --ether "${!w}" "${rpc[@]}")"
done
ausd="$(cast call "$AUSD_ADDRESS" 'balanceOf(address)(uint256)' "$TREASURY_ADDRESS" "${rpc[@]}" | awk '{print $1}')"
echo "treasury AUSD:         $(echo "scale=2; $ausd / 10^$decimals" | bc)"
[ "$(echo "$ausd >= 20000 * 10^$decimals" | bc)" = 1 ] || echo "WARNING: the treasury holds less than 20.000 AUSD (PRD 10)"
read -r -p "Deploy AmplopEnvelopes (demo mode) to Monad testnet now? [y/N] " ok
[ "$ok" = "y" ] || [ "$ok" = "Y" ] || { echo "stopped, nothing sent"; exit 0; }

say "2/5 Deploy (Foundry asks for the keystore password)"
forge script script/Deploy.s.sol:Deploy "${rpc[@]}" --account "$DEPLOYER_ACCOUNT" --sender "$DEPLOYER_ADDRESS" \
  --broadcast --slow --gas-estimate-multiplier 120

say "3/5 Record deployments/monad-testnet.json"
node script/write-deployment.mjs 10143

say "4/5 Approvals (keys are read hidden and dropped right after)"
read -rs -p "Treasury private key: " TREASURY_PRIVATE_KEY && echo
read -rs -p "Settlement private key: " SETTLEMENT_PRIVATE_KEY && echo
export TREASURY_PRIVATE_KEY SETTLEMENT_PRIVATE_KEY
trap 'unset TREASURY_PRIVATE_KEY SETTLEMENT_PRIVATE_KEY' EXIT
forge script script/Approve.s.sol:Approve "${rpc[@]}" --broadcast --slow
unset TREASURY_PRIVATE_KEY SETTLEMENT_PRIVATE_KEY
rm -rf cache/Approve.s.sol # Foundry's local cache of "sensitive values" for this run

say "5/5 Wallet check"
bash script/check-wallets.sh 10143 && echo "All done. Tell Claude the deploy finished."
