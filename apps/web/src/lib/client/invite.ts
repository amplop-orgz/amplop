// Invite links and the accept signature (10 S10-4, S10-13, S10-15, S10-16). The key appears only
// after the `#`, which browsers never send to a server.
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export function inviteLink(origin: string, inviteId: string, key: Hex): string {
  return `${origin}/invite/${inviteId}#k=${key.slice(2).toLowerCase()}`;
}

/** `#k=` and 64 hex characters, an optional 0x accepted. */
export function parseInviteFragment(hash: string): Hex | null {
  const m = /^#k=(?:0x)?([0-9a-fA-F]{64})$/.exec(hash);
  return m ? `0x${(m[1] ?? "").toLowerCase()}` : null;
}

export function acceptTypedData(
  chainId: number,
  contract: Address,
  accountId: bigint,
  trusted: Address,
) {
  return {
    domain: { name: "AmplopEnvelopes", version: "1", chainId, verifyingContract: contract },
    types: {
      AcceptInvite: [
        { name: "accountId", type: "uint256" },
        { name: "trusted", type: "address" },
      ],
    },
    primaryType: "AcceptInvite",
    message: { accountId, trusted },
  } as const;
}

export function signAccept(
  key: Hex,
  chainId: number,
  contract: Address,
  accountId: bigint,
  trusted: Address,
): Promise<Hex> {
  return privateKeyToAccount(key).signTypedData(
    acceptTypedData(chainId, contract, accountId, trusted),
  );
}

export type ExistingDecision = "own" | "already" | "other" | "accept";

/** S10-16: what to do when someone uses a passkey already on the phone. */
export function existingPasskeyDecision(
  role: { studentAccountId?: bigint; trustedAccountId?: bigint },
  inviteAccountId: bigint,
): ExistingDecision {
  if (role.studentAccountId === inviteAccountId) return "own";
  if (role.trustedAccountId === inviteAccountId) return "already";
  if (role.trustedAccountId !== undefined) return "other";
  return "accept";
}
