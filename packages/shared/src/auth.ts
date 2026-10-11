// Signed request message (01 section 4, 05 S05-7, S05-13). The browser builds exactly the bytes the
// server parses.

export const ACTIONS = [
  "fund",
  "profile.save",
  "profile.read",
  "invite.create",
  "invite.latest",
  "topup.create",
  "topup.read",
  "topup.simulate",
  "card.issue",
  "card.authorize",
  "card.collect",
  "purchases.read",
  "reason.save",
  "reason.current",
  "reason.read",
  "recovery.create",
  "recovery.read",
  "recovery.dismiss",
] as const;

export type ActionName = (typeof ACTIONS)[number];

export type AuthFields = {
  site: string;
  chainId: number | bigint;
  action: ActionName;
  accountId: bigint;
  address: string;
  nonce: string;
  issued: string;
  bodySha256: string;
};

export const AUTH_MESSAGE_HEADER = "Amplop-Auth-Message";
export const AUTH_SIGNATURE_HEADER = "Amplop-Auth-Signature";
export const DEVICE_HEADER = "Amplop-Device";

export function buildAuthMessage(f: AuthFields): string {
  return [
    "Amplop request",
    `Site: ${f.site}`,
    `Chain: ${f.chainId.toString()}`,
    `Action: ${f.action}`,
    `Account: ${f.accountId.toString()}`,
    `Address: ${f.address.toLowerCase()}`,
    `Nonce: ${f.nonce}`,
    `Issued: ${f.issued}`,
    `Body: ${f.bodySha256}`,
  ].join("\n");
}

/** Lowercase hex SHA-256 (WebCrypto, so the same code runs in the browser and on the server). */
export async function sha256Hex(data: Uint8Array<ArrayBuffer> | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function toBase64Url(text: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes base64url (padding optional) to UTF-8; null when it is not valid base64url or UTF-8. */
export function fromBase64Url(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(encoded)) return null;
  try {
    const bin = atob(encoded.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(bin, (c) => c.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}
