// Passkey accounts with Mera (06 S06-11 to S06-20). The key lives inside Mera's signing session, in
// memory; keep.ts holds the only stored copy, encrypted and for this tab (S06-16a).
"use client";
import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { useSyncExternalStore } from "react";
import type { LocalAccount } from "viem";
import { read } from "../chain/client";
import { DEMO } from "../env";
import type { Role } from "../guard";
import { forgetLast, profileFor, saveProfile } from "../profiles";
import { invalidateAll } from "../query";
import { forget, keep, restore, touch } from "./keep";

export type Session = { address: `0x${string}`; credentialId: string; account: LocalAccount };
export type { Role };

export class PasskeyCancelled extends Error {
  override name = "PasskeyCancelled";
}
export class PasskeyUnsupported extends Error {
  override name = "PasskeyUnsupported";
}
export class PasskeyFailed extends Error {
  override name = "PasskeyFailed";
}

type State = {
  session: Session | null;
  role: Role | "loading" | "error";
  signer: Secp256k1SigningSession | null;
  createdHere: Set<string>;
  /** True until the tab's kept session (S06-16a) has been restored or ruled out. */
  restoring: boolean;
};

let state: State = {
  session: null,
  role: "loading",
  signer: null,
  createdHere: new Set(),
  restoring: typeof window !== "undefined",
};
// The server render and hydration both show the restoring state, so they match.
const SERVER: State = { ...state, restoring: true };
const listeners = new Set<() => void>();

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

/** S06-14: PRF output → BIP-39 entropy → seed → m/44'/60'/0'/0/0. Never change it: it is every user's address. */
export function deriveSigner(prfOutput: Uint8Array): Secp256k1SigningSession {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  const privateKey = node.privateKey;
  if (!privateKey) throw new PasskeyFailed("no key");
  const signer = createSecp256k1SigningSession({ privateKey });
  privateKey.fill(0);
  seed.fill(0);
  prfOutput.fill(0);
  node.wipePrivateData();
  return signer;
}

function mapError(e: unknown): Error {
  if (
    e instanceof PasskeyCancelled ||
    e instanceof PasskeyUnsupported ||
    e instanceof PasskeyFailed
  )
    return e;
  if (isMeraError(e)) {
    if (e.code === "PRF_UNAVAILABLE") return new PasskeyUnsupported(e.code);
    if (e.code === "PASSKEY_OPERATION_FAILED") {
      const cause = (e as { cause?: unknown }).cause;
      if (cause === undefined || (cause instanceof Error && cause.name === "NotAllowedError"))
        return new PasskeyCancelled(e.code);
    }
  }
  return new PasskeyFailed(e instanceof Error ? e.name : "unknown");
}

function start(prfOutput: Uint8Array, credentialId: string): Session {
  void keep(prfOutput.slice(), credentialId).catch(() => undefined);
  const signer = deriveSigner(prfOutput);
  const account = toViemAccount(signer);
  state.signer?.end();
  const session: Session = { address: account.address, credentialId, account };
  set({ session, signer, role: "loading" });
  void roleWithRetry(session);
  return session;
}

if (typeof window !== "undefined") {
  restore()
    .then((r) => {
      if (r && !state.session) start(r.prf, r.credentialId);
    })
    .catch(() => undefined)
    .finally(() => {
      set({ restoring: false });
    });
  window.addEventListener("pagehide", touch);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") touch();
  });
}

/** A dropped RPC request must not strand the person on "No connection": three tries, 1 s then 2 s apart. */
async function roleWithRetry(session: Session): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await refreshRole();
      return;
    } catch {
      if (state.session !== session) return;
      if (attempt === 3) {
        set({ role: "error" });
        return;
      }
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

/** S06-12. */
export async function checkPasskeySupport(): Promise<
  { ok: true } | { ok: false; reason: "no_webauthn" | "no_platform_authenticator" | "no_prf" }
> {
  if (typeof window === "undefined" || !("PublicKeyCredential" in window))
    return { ok: false, reason: "no_webauthn" };
  try {
    if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
      return { ok: false, reason: "no_platform_authenticator" };
    }
    const getCaps = (
      PublicKeyCredential as unknown as {
        getClientCapabilities?: () => Promise<Record<string, boolean>>;
      }
    ).getClientCapabilities;
    if (getCaps) {
      const caps = await getCaps();
      if (caps["extension:prf"] === false) return { ok: false, reason: "no_prf" };
    }
  } catch {
    return { ok: false, reason: "no_platform_authenticator" };
  }
  return { ok: true };
}

/** S06-13. The user name tells two Amplop passkeys apart in the phone's chooser. */
export async function createPasskeyAccount(
  kind: "student" | "trusted",
  opts: { studentShortName?: string; label?: string } = {},
): Promise<Session> {
  const name =
    kind === "student"
      ? "Amplop student account"
      : `Amplop: trusted person for ${opts.studentShortName ?? "a student"}`;
  try {
    const r = await createPasskeyWithPrfOutput({
      rp: { id: location.hostname, name: "Amplop" },
      user: { name, displayName: name },
    });
    saveProfile({
      credentialId: r.credentialId,
      label: opts.label ?? (kind === "student" ? "Amplop student" : "Trusted person"),
      ...(r.transports ? { transports: [...r.transports] } : {}),
    });
    state.createdHere.add(r.credentialId);
    return start(r.prfOutput, r.credentialId);
  } catch (e) {
    throw mapError(e);
  }
}

/** S06-19: a known credential is passed as allowCredentials, so the browser never picks another one. */
export async function signInWithPasskey(opts: { credentialId?: string } = {}): Promise<Session> {
  try {
    const known = opts.credentialId ? profileFor(opts.credentialId) : undefined;
    const r = await getPasskeyPrfOutput({
      rpId: location.hostname,
      ...(opts.credentialId
        ? {
            credential: {
              credentialId: opts.credentialId,
              ...(known?.transports ? { transports: known.transports } : {}),
            },
          }
        : {}),
    });
    const listed = profileFor(r.credentialId);
    saveProfile(listed ?? { credentialId: r.credentialId, label: "Amplop" });
    return start(r.prfOutput, r.credentialId);
  } catch (e) {
    throw mapError(e);
  }
}

/** S06-16: ends the signing session and forgets everything read for it, including the kept copy. */
export function signOut(): void {
  void forget();
  forgetLast(); // S06-10a: after a sign-out, /app shows Welcome rather than Welcome back
  state.signer?.end();
  invalidateAll();
  set({ session: null, signer: null, role: "loading" });
}

/** S06-19, the View as mechanism: prompt first, and only on success leave the current account. */
export async function switchProfile(
  credentialId: string,
  opts: { stay?: boolean } = {},
): Promise<{ session: Session; home: "/app" | "/app/parent" | null }> {
  if (!DEMO) throw new Error("View as is only available in the demo");
  const known = profileFor(credentialId);
  let r;
  try {
    r = await getPasskeyPrfOutput({
      rpId: location.hostname,
      credential: { credentialId, ...(known?.transports ? { transports: known.transports } : {}) },
    });
  } catch (e) {
    throw mapError(e);
  }
  state.signer?.end();
  invalidateAll();
  set({ session: null, signer: null, role: "loading" });
  saveProfile(known ?? { credentialId: r.credentialId, label: "Amplop" });
  const session = start(r.prfOutput, r.credentialId);
  const role = await refreshRole();
  // 15 S15-7: the caller navigates in-app; a full page load would drop the new in-memory session.
  if (opts.stay) return { session, home: null };
  return {
    session,
    home:
      role.trustedAccountId !== undefined && role.studentAccountId === undefined
        ? "/app/parent"
        : "/app",
  };
}

/** S06-20: the contract is the only source of the role. */
export async function resolveRole(address: `0x${string}`): Promise<Role> {
  const [s, t] = await Promise.all([
    read<bigint>("accountOf", [address]),
    read<bigint>("trustedAccountOf", [address]),
  ]);
  return { ...(s > 0n ? { studentAccountId: s } : {}), ...(t > 0n ? { trustedAccountId: t } : {}) };
}

/** Re-reads the role (after a write, a switch, and on focus). */
export async function refreshRole(): Promise<Role> {
  const s = state.session;
  if (!s) return {};
  const role = await resolveRole(s.address);
  if (state.session?.address === s.address) set({ role });
  return role;
}

export function wasCreatedHere(credentialId: string): boolean {
  return state.createdHere.has(credentialId);
}

export function currentSession(): Session | null {
  return state.session;
}

export function useSession(): {
  session: Session | null;
  role: Role | "loading" | "error";
  restoring: boolean;
} {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => SERVER,
  );
  return { session: s.session, role: s.role, restoring: s.restoring };
}
