// Role check on the contract (05 S05-11): read at `latest` on every request, never cached.
import "server-only";
import type { AccountInfo } from "./types";
import { chain } from "../chain/chain";
import { apiError } from "../http/errors";
import type { SignedAuth } from "./verify";

export type SignedKind =
  "signed:owner" | "signed:trusted" | "signed:either" | "signed:address" | "signed:trusted-any";

const ZERO = "0x0000000000000000000000000000000000000000";

async function readOrUnavailable<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch {
    throw apiError("chain_unavailable");
  }
}

export async function checkRole(kind: SignedKind, auth: SignedAuth): Promise<void> {
  if (kind === "signed:address") return;
  const me = auth.address.toLowerCase();
  if (kind === "signed:trusted-any") {
    const id = await readOrUnavailable(chain().read<bigint>("trustedAccountOf", [auth.address]));
    if (id === 0n || id !== auth.accountId) throw apiError("not_trusted");
    return;
  }
  const info =
    auth.accountId === 0n
      ? null
      : await readOrUnavailable(chain().read<AccountInfo>("accountInfo", [auth.accountId]));
  const owner = info?.owner.toLowerCase() ?? ZERO;
  const trusted = info?.trusted.toLowerCase() ?? ZERO;
  const isOwner = owner !== ZERO && owner === me;
  const isTrusted = trusted !== ZERO && trusted === me;
  if (kind === "signed:owner" && !isOwner) throw apiError("not_owner");
  if (kind === "signed:trusted" && !isTrusted) throw apiError("not_trusted");
  if (kind === "signed:either" && !isOwner && !isTrusted) throw apiError("not_allowed");
}
