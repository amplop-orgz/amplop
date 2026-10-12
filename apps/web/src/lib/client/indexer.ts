// The Envio indexer client and the lag rule (16 S16-13, S16-14). Nothing core reads from here:
// balances, totals, schedules, the open Emergency request and card results come from the contract.
"use client";
import { INDEXER_MAX_LAG_BLOCKS, INDEXER_TIMEOUT_MS } from "@amplop/shared/constants";
import { IndexerMetaQuery, type IndexerMetaResult } from "@amplop/shared/indexer";
import { useCallback } from "react";
import { publicClient } from "./chain/client";
import { INDEXER_URL } from "./env";
import { useRead } from "./query";

/** POST `{ query, variables }`, 4 s timeout, throw on GraphQL errors. */
export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  if (!INDEXER_URL) throw new Error("no indexer");
  const res = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(INDEXER_TIMEOUT_MS),
    cache: "no-store",
  });
  const json = (await res.json()) as { data?: T; errors?: unknown[] };
  if (!res.ok || json.errors?.length || !json.data) throw new Error("indexer query failed");
  return json.data;
}

/** S16-14: behind when the call fails or is slow, not ready, or more than 30 blocks back. */
export function isBehind(
  meta: { progressBlock: number; isReady: boolean } | undefined,
  head: bigint,
  minBlock?: bigint,
): boolean {
  if (!meta?.isReady) return true;
  const progress = BigInt(meta.progressBlock);
  if (head - progress > BigInt(INDEXER_MAX_LAG_BLOCKS)) return true;
  return minBlock !== undefined && progress < minBlock;
}

/** Checked at most every 10 s while a history screen is open. `minBlock`: a block this screen just wrote. */
export function useIndexerBehind(minBlock?: bigint): boolean {
  const fetcher = useCallback(async () => {
    try {
      const [meta, head] = await Promise.all([
        gql<IndexerMetaResult>(IndexerMetaQuery),
        publicClient.getBlockNumber(),
      ]);
      return {
        progressBlock: meta._meta[0]?.progressBlock ?? 0,
        isReady: meta._meta[0]?.isReady ?? false,
        head,
      };
    } catch {
      return null;
    }
  }, []);
  const r = useRead("indexer-meta", fetcher, { intervalMs: 10_000 });
  if (r.data === undefined) return false;
  if (r.data === null) return true;
  return isBehind(r.data, r.data.head, minBlock);
}
