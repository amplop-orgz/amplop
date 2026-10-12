// Browser configuration (01 section 7). Each name is written out so Next.js inlines it at build time.
import type { Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337");
export const CONTRACT = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? ZERO) as Address;
export const RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "http://127.0.0.1:8545";
export const RPC_URL_FALLBACK = process.env.NEXT_PUBLIC_MONAD_RPC_URL_FALLBACK ?? RPC_URL;
export const EXPLORER_TX_URL = process.env.NEXT_PUBLIC_EXPLORER_TX_URL ?? "";
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "";
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** The sample rates shown on screen (01 section 7); the server converts with its own copy. */
const eur = (process.env.NEXT_PUBLIC_SAMPLE_RATE_USD_PER_EUR ?? "1.1511").split(".");
export const RATES = {
  idrPerUsd: BigInt(process.env.NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD ?? "16500"),
  usdPerEur: {
    num: BigInt((eur[0] ?? "1") + (eur[1] ?? "")),
    den: 10n ** BigInt((eur[1] ?? "").length),
  },
};
