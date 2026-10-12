// Top-up helpers for boards 1.2 to 1.4 and 2.1 (spec 08): amount rules, the split in force, the open
// orders this device remembers, and the Deposited event a screen reads from the chain.
"use client";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { useCallback } from "react";
import { parseEventLogs, type Hash, type Log } from "viem";
import { useSession } from "./account";
import { api } from "./api";
import { publicClient, type AccountInfo } from "./chain/client";
import { CONTRACT, RATES } from "./env";
import { useRead } from "./query";
import { readJson, writeItem } from "./storage";

export const MIN_RUPIAH = 100_000n;
export const MAX_RUPIAH = 50_000_000n;
export const DEFAULT_RUPIAH = 16_500_000n;

export type OrderStatus = "waiting" | "received" | "sent" | "expired" | "failed";
export type OrderView = {
  orderId: string;
  status: OrderStatus;
  rupiah: string;
  dollars: string;
  vaNumber: string | null;
  bank: string | null;
  expiresAt: string | null;
  depositTx?: string;
  lastCheckedAt: string | null;
  confirmMs?: number;
};

/** `round(amount × rate / 10^decimals)`: gives back the exact rupiah of an order at this rate (S08-12). */
export function rupiahOf(amount: bigint, decimals: number, rate = RATES.idrPerUsd): bigint {
  const unit = 10n ** BigInt(decimals);
  return (amount * rate + unit / 2n) / unit;
}

/** S08-3: digits only, as typed or pasted. */
export function digitsOnly(text: string): string {
  return text.replace(/\D/g, "").replace(/^0+/, "").slice(0, 11);
}

export function amountProblem(digits: string): "empty" | "below" | "above" | null {
  if (!digits) return "empty";
  const n = BigInt(digits);
  if (n < MIN_RUPIAH) return "below";
  if (n > MAX_RUPIAH) return "above";
  return null;
}

/** `8808081234567890` → `8808 0812 3456 7890`. */
export function groupVa(va: string): string {
  return va.replace(/(.{4})(?=.)/g, "$1 ");
}

/** S08-4, R21: the split a deposit made now would use. */
export function splitInForce(info: AccountInfo, clock: bigint): readonly number[] {
  const pending = info.pendingSplitStartsAt > 0n && info.pendingSplitStartsAt <= clock;
  return pending ? info.pendingSplit : info.split;
}

/** S08-9: a waiting order past its expiry shows as expired until the server confirms. */
export function shownStatus(o: OrderView, nowMs: number): OrderStatus {
  if (o.status === "waiting" && o.expiresAt && nowMs > Date.parse(o.expiresAt)) return "expired";
  return o.status;
}

export const isOpen = (s: OrderStatus) => s === "waiting" || s === "received";

// ------------------------------------------------------------ amplop.openOrders (01 section 9)

export type OpenEntry = { accountId: string; orderId: string; rupiah: string; createdAt: number };
const ORDERS_KEY = "amplop.openOrders";

export function readEntries(): OpenEntry[] {
  const raw = readJson("local", ORDERS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is OpenEntry =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as OpenEntry).orderId === "string" &&
      /^[0-9a-f]{32}$/.test((e as OpenEntry).orderId) &&
      typeof (e as OpenEntry).accountId === "string" &&
      /^[0-9]+$/.test((e as OpenEntry).rupiah),
  );
}

function writeEntries(list: OpenEntry[]): void {
  writeItem("local", ORDERS_KEY, JSON.stringify(list.slice(0, 5)));
}

export function rememberOrder(e: OpenEntry): void {
  writeEntries([e, ...readEntries().filter((x) => x.orderId !== e.orderId)]);
}

/**
 * A closed order is dropped, except the account's newest entry, which stays as the prefill for the
 * next amount (decision 14) and is never shown as open.
 */
export function forgetOrder(orderId: string): void {
  const list = readEntries();
  const e = list.find((x) => x.orderId === orderId);
  if (!e) return;
  const newest = list.find((x) => x.accountId === e.accountId);
  if (newest?.orderId === orderId) return;
  writeEntries(list.filter((x) => x.orderId !== orderId));
}

export function lastAmount(accountId: bigint): bigint {
  const e = readEntries().find((x) => x.accountId === accountId.toString());
  return e ? BigInt(e.rupiah) : DEFAULT_RUPIAH;
}

export function getOrder(orderId: string, accountId: bigint): Promise<OrderView> {
  return api.get<OrderView>(`/api/topup/${orderId}`, { auth: { action: "topup.read", accountId } });
}

/** S08-6: this device's entries for the account that are still open, with their live state. */
export function useOpenOrders(accountId: bigint | undefined) {
  const { session } = useSession();
  const fetcher = useCallback(async () => {
    if (accountId === undefined) return [];
    const mine = readEntries().filter((e) => e.accountId === accountId.toString());
    const out: { entry: OpenEntry; order: OrderView }[] = [];
    for (const entry of mine) {
      try {
        const order = await getOrder(entry.orderId, accountId);
        if (isOpen(shownStatus(order, Date.now()))) out.push({ entry, order });
        else forgetOrder(entry.orderId);
      } catch {
        // A failed read keeps the entry; the next visit tries again.
      }
    }
    return out;
  }, [accountId]);
  return useRead(
    accountId === undefined || !session ? null : `open-orders:${accountId.toString()}`,
    fetcher,
  );
}

// ------------------------------------------------------------ Deposited

export type Deposit = {
  accountId: bigint;
  paymentId: `0x${string}`;
  amount: bigint;
  parts: readonly bigint[];
  startDay: bigint;
  txHash: Hash;
};

function decodeDeposits(logs: readonly Log[]): Deposit[] {
  return parseEventLogs({ abi: amplopEnvelopesAbi, logs: [...logs], eventName: "Deposited" })
    .filter((l) => l.address.toLowerCase() === CONTRACT.toLowerCase())
    .map((l) => ({ ...l.args, txHash: l.transactionHash }));
}

/** The one Deposited of this contract in a receipt, matching `paymentId` when given. */
export async function depositFromTx(tx: Hash, paymentId?: string): Promise<Deposit | null> {
  const receipt = await publicClient.getTransactionReceipt({ hash: tx }).catch(() => null);
  if (!receipt) return null;
  const found = decodeDeposits(receipt.logs).filter(
    (d) => paymentId === undefined || d.paymentId === paymentId,
  );
  return found.length === 1 ? (found[0] ?? null) : null;
}

/** Deposited logs over the latest 100 blocks (the RPC's getLogs range limit, S08-11, S08-13). */
export async function recentDeposits(args: {
  accountId?: bigint;
  paymentId?: `0x${string}`;
}): Promise<Deposit[]> {
  const head = await publicClient.getBlockNumber();
  const logs = await publicClient.getContractEvents({
    address: CONTRACT,
    abi: amplopEnvelopesAbi,
    eventName: "Deposited",
    args,
    fromBlock: head > 99n ? head - 99n : 0n,
    toBlock: head,
  });
  return decodeDeposits(logs);
}
