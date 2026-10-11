// The fee top-up decision (07 S07-26 steps 4 to 6), a pure function so every row is unit-tested.
import "server-only";
import { FUND_TARGET_ACTIONS, FUND_THRESHOLD_ACTIONS } from "@amplop/shared/constants";
import { TRANSFER_GAS, type FundLimits } from "./config";

export type FundInput = {
  balance: bigint;
  unit: bigint; // TYPICAL_ACTION_GAS × maxFeePerGas
  maxFeePerGas: bigint;
  ipCountToday: number;
  addressRow: { day: string; countToday: number } | null;
  today: string; // UTC date, YYYY-MM-DD
  deviceNewCountToday: number;
  weiSentToday: bigint;
  sponsorBalance: bigint;
  limits: FundLimits;
};

export type FundCode =
  | "fund_limit_ip"
  | "fund_limit_address"
  | "fund_limit_device"
  | "fund_daily_cap"
  | "fund_unavailable";

export type FundDecision =
  | { kind: "not_needed" }
  | { kind: "refuse"; code: FundCode; alert?: "fund_cap_reached" | "fund_sponsor_low" }
  | { kind: "send"; amount: bigint; budgetLow: boolean };

/** Step 4 and 5, before any lock: is a top-up needed, and how much brings the account to ~20 actions. */
export function fundAmount(balance: bigint, unit: bigint): bigint | null {
  if (balance >= FUND_THRESHOLD_ACTIONS * unit) return null;
  return FUND_TARGET_ACTIONS * unit - balance;
}

export function decideFund(i: FundInput): FundDecision {
  const amount = fundAmount(i.balance, i.unit);
  if (amount === null) return { kind: "not_needed" };
  if (i.ipCountToday >= i.limits.perIpPerDay) return { kind: "refuse", code: "fund_limit_ip" };
  const countToday = i.addressRow && i.addressRow.day === i.today ? i.addressRow.countToday : 0;
  if (countToday >= i.limits.addressPerDay) return { kind: "refuse", code: "fund_limit_address" };
  if (i.addressRow === null && i.deviceNewCountToday >= i.limits.newAddressesPerDevicePerDay) {
    return { kind: "refuse", code: "fund_limit_device" };
  }
  if (i.weiSentToday + amount > i.limits.dailyCapWei)
    return { kind: "refuse", code: "fund_daily_cap", alert: "fund_cap_reached" };
  const after = i.sponsorBalance - amount - TRANSFER_GAS * i.maxFeePerGas;
  if (after < i.limits.reserveFloorWei)
    return { kind: "refuse", code: "fund_unavailable", alert: "fund_sponsor_low" };
  // S07-28: the wallet can no longer cover the rest of today's budget above its floor.
  const budgetLeft = i.limits.dailyCapWei - i.weiSentToday - amount;
  const budgetLow = i.sponsorBalance - amount < i.limits.reserveFloorWei + budgetLeft;
  return { kind: "send", amount, budgetLow };
}
