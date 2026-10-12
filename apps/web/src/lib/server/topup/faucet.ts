// Treasury floor and the testnet AUSD faucet (08 S08-33). Day-one check (12 Oct 2026): the faucet at
// AUSD_FAUCET_ADDRESS is a contract; `requestFunds(address)` gives 10 000 AUSD, once a minute.
import "server-only";
import { erc20Abi, parseAbi, type Hex } from "viem";
import { sendAlert } from "../alerts";
import { tokenDecimals } from "../card/common";
import { chain } from "../chain/chain";
import { env } from "../env";
import { bump } from "../http/ratelimit";
import { log } from "../log";

const FAUCET_ABI = parseAbi(["function requestFunds(address recipient)"]);
const FLOOR_DOLLARS = 20_000n;

export function treasuryRead<T>(functionName: "balanceOf" | "allowance", args: readonly unknown[]) {
  return chain().rpc.readContract({
    address: chain().cfg.token,
    abi: erc20Abi,
    functionName,
    args,
  }) as Promise<T>;
}

export type FaucetResult = { ok: true; hash: Hex } | { ok: false; reason: "manual" | "failed" };

/** One faucet request from the treasury key; without a faucet address the refill is by hand. */
export async function requestFaucet(): Promise<FaucetResult> {
  const faucet = env().AUSD_FAUCET_ADDRESS;
  if (!faucet) return { ok: false, reason: "manual" };
  try {
    const r = await chain().send("treasury", {
      address: faucet,
      abi: FAUCET_ABI,
      functionName: "requestFunds",
      args: [chain().address("treasury")],
    });
    return r.receipt ? { ok: true, hash: r.hash } : { ok: false, reason: "failed" };
  } catch (e) {
    log.warn("faucet_failed", { error: e });
    return { ok: false, reason: "failed" };
  }
}

/** Below 20 000 AUSD: one faucet call a minute at most, and an alert (deduped hourly). */
export async function ensureTreasuryFloor(): Promise<void> {
  const unit = 10n ** BigInt(await tokenDecimals());
  const balance = await treasuryRead<bigint>("balanceOf", [chain().address("treasury")]);
  if (balance >= FLOOR_DOLLARS * unit) return;
  if ((await bump("faucet", "minute")) > 1) return;
  const r = await requestFaucet();
  log.info("faucet", { ok: r.ok, ...(r.ok ? { txHash: r.hash } : { reason: r.reason }) });
  await sendAlert(
    "treasury_low",
    `Amplop treasury holds ${(balance / unit).toString()} AUSD, below the 20000 floor.${
      r.ok ? " A faucet refill was requested." : " Refill it by hand."
    }`,
  );
}
