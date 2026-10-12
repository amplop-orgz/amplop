// SEC3 (S19-14): the server log holds no private key, invite key, name, reason or other personal
// text typed in the tests (PRD 15 "Logs"). Run by the global teardown, so every run and every CI
// shard checks the log its own tests wrote.
import { KEYS } from "./stack";

const TYPED = [
  "Raka",
  "Mama",
  "Dewi",
  "Laptop charger",
  "Train ticket home",
  "Doctor visit",
  "Secret reason text",
  "Phone screen",
  "Bike repair",
  "Glasses",
  "<script>",
  "onerror",
];

/** What the log should not contain; empty when it is clean. */
export function logLeaks(log: string): string[] {
  const leaks: string[] = [];
  for (const k of Object.values(KEYS))
    if (log.includes(k) || log.includes(k.slice(2))) leaks.push("a private key");
  if (/#k=|[?&]k=(?:0x)?[0-9a-f]{64}/.test(log)) leaks.push("an invite key");
  for (const t of TYPED) if (log.includes(t)) leaks.push(`"${t}"`);
  return leaks;
}
