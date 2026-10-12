// The contract reads behind boards 2.2 and 2.3 (11 S11-5): one batch, re-read every 15 s while
// visible and after every transaction this app sends. Nothing here reads the indexer.
"use client";
import type { Schedule } from "@amplop/shared/schedule";
import { useCallback } from "react";
import { read, type AccountInfo } from "./chain/client";
import type { EmergencyInfo } from "./emergency";
import { useRead } from "./query";

export type EnvelopeView = { available: bigint; unreleased: bigint; held: bigint; locked: bigint };

export type HomeData = {
  info: AccountInfo;
  envelopes: readonly EnvelopeView[];
  nextReleaseDay: bigint;
  clock: bigint;
  schedules: readonly Schedule[];
  em: EmergencyInfo;
  decimals: number;
  readAt: number;
};

export function useHome(accountId: bigint | undefined) {
  const fetcher = useCallback(async (): Promise<HomeData> => {
    const id = accountId ?? 0n;
    const [info, env, clock, schedules, em, decimals] = await Promise.all([
      read<AccountInfo>("accountInfo", [id]),
      read<readonly [readonly EnvelopeView[], bigint]>("envelopes", [id]),
      read<bigint>("clock", [id]),
      read<readonly Schedule[]>("schedules", [id]),
      read<EmergencyInfo>("emergency", [id]),
      read<number>("tokenDecimals"),
    ]);
    return {
      info,
      envelopes: env[0],
      nextReleaseDay: env[1],
      clock,
      schedules,
      em,
      decimals,
      readAt: performance.now(),
    };
  }, [accountId]);
  return useRead(accountId === undefined ? null : `home:${accountId.toString()}`, fetcher, {
    intervalMs: 15_000,
  });
}
