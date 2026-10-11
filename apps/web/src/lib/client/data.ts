// Contract and server reads shared by the screens of 07 and 10, through the read cache.
"use client";
import { PendingKind } from "@amplop/shared/enums";
import { useCallback } from "react";
import { currentSession, useSession } from "./account";
import { api, ApiError } from "./api";
import { read, ZERO_ADDRESS, type AccountInfo } from "./chain/client";
import { useRead } from "./query";

export type Pending = { active: boolean; readyAt: bigint; data: `0x${string}` };
export type Invite = { inviteKey: `0x${string}`; expiresAt: bigint; used: boolean };

export type AccountData = {
  info: AccountInfo;
  invite: Invite;
  removal: Pending;
  recovery: Pending;
  clock: bigint;
  readAt: number;
};

async function loadAccount(id: bigint): Promise<AccountData> {
  const [info, inv, removal, recovery, clock] = await Promise.all([
    read<AccountInfo>("accountInfo", [id]),
    read<readonly [`0x${string}`, bigint, boolean]>("inviteOf", [id]),
    read<readonly [boolean, bigint, `0x${string}`]>("pending", [id, PendingKind.TrustedRemoval]),
    read<readonly [boolean, bigint, `0x${string}`]>("pending", [id, PendingKind.Recovery]),
    read<bigint>("clock", [id]),
  ]);
  const p = (x: readonly [boolean, bigint, `0x${string}`]): Pending => ({
    active: x[0],
    readyAt: x[1],
    data: x[2],
  });
  return {
    info,
    invite: { inviteKey: inv[0], expiresAt: inv[1], used: inv[2] },
    removal: p(removal),
    recovery: p(recovery),
    clock,
    readAt: performance.now(),
  };
}

/** Everything 07's homes and 10's invite screen and trusted-person row read from the contract. */
export function useAccount(accountId: bigint | undefined, opts: { intervalMs?: number } = {}) {
  return useRead(
    accountId === undefined ? null : `account:${accountId.toString()}`,
    () => loadAccount(accountId ?? 0n),
    opts,
  );
}

export function hasTrusted(a: AccountData): boolean {
  return a.info.trusted !== ZERO_ADDRESS;
}

/** An invite exists, is unused and has not expired on the account clock (07 S07-19). */
export function inviteOpen(a: AccountData): boolean {
  return a.invite.inviteKey !== ZERO_ADDRESS && !a.invite.used && a.clock < a.invite.expiresAt;
}

/** The student's saved name, or null when none is saved yet (404). */
export function useProfileName(accountId: bigint | undefined) {
  const { session } = useSession();
  const key =
    accountId === undefined || !session
      ? null
      : `profile:${session.address}:${accountId.toString()}`;
  const fetcher = useCallback(async () => {
    try {
      const r = await api.get<{ name: string }>(`/api/profile/${String(accountId)}`, {
        auth: { action: "profile.read", accountId },
      });
      return r.name;
    } catch (e) {
      if (e instanceof ApiError && e.code === "profile_not_found") return null;
      throw e;
    }
  }, [accountId]);
  return useRead<string | null>(key, fetcher);
}

/** 10 S10-11: the trusted person's name while one is linked, else null (each screen has its fallback). */
export function useLatestInvite(accountId: bigint | undefined) {
  const { session } = useSession();
  const key =
    accountId === undefined || !session
      ? null
      : `invite-latest:${session.address}:${accountId.toString()}`;
  const fetcher = useCallback(async () => {
    try {
      return await api.get<{ inviteId: string; trustedName: string; state: string }>(
        "/api/invite/latest",
        {
          auth: { action: "invite.latest", accountId },
        },
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === "invite_not_found") return null;
      throw e;
    }
  }, [accountId]);
  return useRead(key, fetcher);
}

export function useTrustedName(accountId: bigint | undefined): string | null {
  const account = useAccount(accountId);
  const latest = useLatestInvite(accountId);
  if (!account.data || !hasTrusted(account.data)) return null;
  return latest.data?.trustedName ?? null;
}

export function signedInAddress(): `0x${string}` | null {
  return currentSession()?.address ?? null;
}
