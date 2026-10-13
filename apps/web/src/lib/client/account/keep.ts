// 06 S06-16a: a session survives a reload. The PRF output is kept encrypted in sessionStorage (this tab
// only) under a non-extractable AES-GCM key in IndexedDB: script on the page can use that key but never
// read it. The copy ends on sign-out, when the tab closes, or after IDLE_MS away from the page.
"use client";
import { readJson, writeItem } from "../storage";

const ITEM = "amplop.session";
export const IDLE_MS = 30 * 60_000;

type Kept = { id: string; credentialId: string; iv: string; data: string; at: number };

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function read(): Kept | null {
  const k = readJson("session", ITEM) as Partial<Kept> | null;
  return k &&
    typeof k.id === "string" &&
    typeof k.credentialId === "string" &&
    typeof k.iv === "string" &&
    typeof k.data === "string" &&
    typeof k.at === "number"
    ? (k as Kept)
    : null;
}

function keys<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("amplop-keys", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("keys");
    open.onerror = () => {
      reject(open.error ?? new Error("indexedDB"));
    };
    open.onsuccess = () => {
      const db = open.result;
      const req = op(db.transaction("keys", mode).objectStore("keys"));
      req.onsuccess = () => {
        db.close();
        resolve(req.result);
      };
      req.onerror = () => {
        db.close();
        reject(req.error ?? new Error("indexedDB"));
      };
    };
  });
}

/** Encrypts a copy of the PRF output for this tab, then zeroes the copy it was given. */
export async function keep(given: Uint8Array, credentialId: string): Promise<void> {
  const prf = new Uint8Array(given); // an ArrayBuffer-backed copy, as WebCrypto requires
  given.fill(0);
  try {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, prf));
    const id = crypto.randomUUID();
    const old = read();
    await keys("readwrite", (s) => s.put(key, id));
    writeItem(
      "session",
      ITEM,
      JSON.stringify({ id, credentialId, iv: b64(iv), data: b64(data), at: Date.now() }),
    );
    if (old) await keys("readwrite", (s) => s.delete(old.id));
  } finally {
    prf.fill(0);
  }
}

/** Marks the moment the person left the page; the idle limit counts from here. */
export function touch(): void {
  const k = read();
  if (k) writeItem("session", ITEM, JSON.stringify({ ...k, at: Date.now() }));
}

/** The kept PRF output, or null when there is none, it is too old, or it cannot be opened. */
export async function restore(
  now = Date.now(),
): Promise<{ prf: Uint8Array; credentialId: string } | null> {
  const k = read();
  if (!k) return null;
  if (now - k.at > IDLE_MS) {
    await forget();
    return null;
  }
  try {
    const key = await keys<CryptoKey | undefined>(
      "readonly",
      (s) => s.get(k.id) as IDBRequest<CryptoKey | undefined>,
    );
    if (!key) throw new Error("no key");
    const prf = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(k.iv) }, key, unb64(k.data)),
    );
    return { prf, credentialId: k.credentialId };
  } catch {
    await forget();
    return null;
  }
}

/** Drops this tab's copy and its key. */
export async function forget(): Promise<void> {
  const k = read();
  writeItem("session", ITEM, null);
  if (k) await keys("readwrite", (s) => s.delete(k.id)).catch(() => undefined);
}
