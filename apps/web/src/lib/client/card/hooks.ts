// Card reads shared by boards 2.4 to 2.8.
"use client";
import { useCallback } from "react";
import { useSession } from "../account";
import { api } from "../api";
import { read } from "../chain/client";
import { useRead } from "../query";

/** The card is fetched again from the idempotent card.issue; its token stays in memory (09 S09-2). */
export function useCard(accountId: bigint | undefined) {
  const { session } = useSession();
  const fetcher = useCallback(
    () =>
      api.post<{ cardToken: string; last4: string }>(
        "/api/card/issue",
        { accountId: String(accountId) },
        { auth: { action: "card.issue", accountId } },
      ),
    [accountId],
  );
  return useRead(
    accountId === undefined || !session ? null : `card:${session.address}:${String(accountId)}`,
    fetcher,
  );
}

export function useTokenDecimals() {
  return useRead("tokenDecimals", () => read<number>("tokenDecimals"));
}
