// Passkeys used on this device (06 S06-17, S06-18): credential id, label and Mera's transports hint only.
import { readItem, readJson, writeItem } from "./storage";

export type Profile = { credentialId: string; label: string; transports?: string[] };

const KEY = "amplop.profiles.v1";
const LAST = "amplop.lastProfile";
const MAX = 5;

export function listProfiles(): Profile[] {
  const raw = readJson("local", KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is Profile =>
        typeof p === "object" && p !== null && typeof (p as Profile).credentialId === "string",
    )
    .map((p) => ({
      credentialId: p.credentialId,
      label: typeof p.label === "string" ? p.label : "",
      ...(Array.isArray(p.transports)
        ? { transports: p.transports.filter((t) => typeof t === "string") }
        : {}),
    }))
    .slice(0, MAX);
}

/** Saves or refreshes a record, most recent first, and marks it the last used. */
export function saveProfile(record: Profile): void {
  const clean: Profile = {
    credentialId: record.credentialId,
    label: record.label,
    ...(record.transports ? { transports: [...record.transports] } : {}),
  };
  const rest = listProfiles().filter((p) => p.credentialId !== clean.credentialId);
  writeItem("local", KEY, JSON.stringify([clean, ...rest].slice(0, MAX)));
  writeItem("local", LAST, clean.credentialId);
}

export function setProfileLabel(credentialId: string, label: string): void {
  const list = listProfiles();
  const p = list.find((x) => x.credentialId === credentialId);
  if (!p || p.label === label) return;
  p.label = label;
  writeItem("local", KEY, JSON.stringify(list));
}

export function forgetLast(): void {
  writeItem("local", LAST, null);
}

export function lastProfileId(): string | null {
  return readItem("local", LAST);
}

export function profileFor(credentialId: string): Profile | undefined {
  return listProfiles().find((p) => p.credentialId === credentialId);
}
