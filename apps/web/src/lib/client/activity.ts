// History for boards 2.3, 2.9 and 2.10 (11 S11-14 to S11-21): indexer rows, shop names from the
// server (owner only, R27) and the weekly release rows computed from deposits.
"use client";
import {
  ActivityQuery,
  EnvelopePurchasesQuery,
  toBig,
  type ActivityResult,
  type DepositRow,
  type EmergencyRow,
  type EnvelopeName,
  type EnvelopePurchasesResult,
  type PurchaseRow,
} from "@amplop/shared/indexer";
import { weeklyShares } from "@amplop/shared/money";
import { mondayDay, mondayNumber } from "@amplop/shared/schedule";
import { useCallback } from "react";
import { useSession } from "./account";
import { api } from "./api";
import { gql } from "./indexer";
import { useRead } from "./query";

export const ENVELOPE_NAMES: readonly EnvelopeName[] = [
  "Food",
  "Transport",
  "Study",
  "Everyday",
  "Emergency",
];
export const envelopeIndex = (n: EnvelopeName | null): number =>
  n === null ? -1 : ENVELOPE_NAMES.indexOf(n);

export type ShopLineItem = {
  purchaseId: string;
  merchantName: string;
  merchantCity: string;
  currency: "EUR" | "USD" | "IDR";
  amount: string;
  result: "approved" | "declined";
};

/** The indexer's bytes32 id to the 32-hex API form (01 section 5). */
export const apiPurchaseId = (bytes32: string): string => bytes32.slice(-32).toLowerCase();

/** S11-28: once per visit, kept for the session. A failure gives an empty map (S11-18 labels). */
export function usePurchaseNames(accountId: bigint | undefined) {
  const { session } = useSession();
  const fetcher = useCallback(async () => {
    try {
      const r = await api.get<{ items: ShopLineItem[] }>("/api/purchases", {
        auth: { action: "purchases.read", accountId },
      });
      return new Map(r.items.map((i) => [i.purchaseId, i]));
    } catch {
      return new Map<string, ShopLineItem>();
    }
  }, [accountId]);
  return useRead(
    accountId === undefined || !session ? null : `purchase-names:${String(accountId)}`,
    fetcher,
  );
}

export function useActivity(accountId: bigint | undefined, limit: number) {
  const fetcher = useCallback(
    () => gql<ActivityResult>(ActivityQuery, { accountId: String(accountId), limit }),
    [accountId, limit],
  );
  return useRead(
    accountId === undefined ? null : `activity:${String(accountId)}:${String(limit)}`,
    fetcher,
    { intervalMs: 10_000 },
  );
}

export function useEnvelopePurchases(accountId: bigint | undefined, envelope: number) {
  const fetcher = useCallback(
    () =>
      gql<EnvelopePurchasesResult>(EnvelopePurchasesQuery, {
        accountId: String(accountId),
        envelope: ENVELOPE_NAMES[envelope],
        limit: 100,
      }),
    [accountId, envelope],
  );
  return useRead(
    accountId === undefined ? null : `envelope-purchases:${String(accountId)}:${String(envelope)}`,
    fetcher,
    { intervalMs: 10_000 },
  );
}

export type ActivityRow =
  | { kind: "purchase"; key: string; sort: number; day: number; p: PurchaseRow }
  | { kind: "deposit"; key: string; sort: number; day: number; d: DepositRow }
  | { kind: "release"; key: string; sort: number; day: number; k: number; amount: bigint }
  | { kind: "emergency"; key: string; sort: number; day: number; e: EmergencyRow };

const dayFrom = (accountClock: string | number) => Number(toBig(accountClock) / 86_400n);

/**
 * S11-15 to S11-17: purchases, deposits, weekly releases 2 to 4 that are due by `today`, and opened
 * Emergency requests, newest first. A release sorts on its day, ahead of rows from earlier days.
 */
export function buildRows(r: ActivityResult, today: number): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const p of r.Purchase)
    rows.push({
      kind: "purchase",
      key: p.id,
      sort: Number(toBig(p.sortKey)),
      day: dayFrom(p.accountClock),
      p,
    });
  for (const d of r.Deposit) {
    const sort = Number(toBig(d.sortKey));
    const day = dayFrom(d.accountClock);
    rows.push({ kind: "deposit", key: d.id, sort, day, d });
    const start = mondayNumber(Number(toBig(d.startDay)));
    for (let k = 2; k <= 4; k++) {
      const releaseDay = mondayDay(start + k - 1);
      if (releaseDay > today) break;
      const amount = d.parts
        .slice(0, 4)
        .reduce((s, part) => s + (weeklyShares(toBig(part))[k - 1] ?? 0n), 0n);
      // Releases have no block: place them after every row of earlier days, before later ones.
      rows.push({
        kind: "release",
        key: `${d.id}-${String(k)}`,
        sort: -1,
        day: releaseDay,
        k,
        amount,
      });
    }
  }
  for (const e of r.EmergencyRequest)
    if (e.status === "Opened")
      rows.push({
        kind: "emergency",
        key: e.id,
        sort: Number(toBig(e.sortKey)),
        day: dayFrom(e.accountClock),
        e,
      });
  return rows.sort((a, b) => b.day - a.day || b.sort - a.sort);
}
