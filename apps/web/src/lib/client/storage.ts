// The only browser storage the app uses (01 section 9). Blocked storage (private mode) falls back to
// memory for the tab, so nothing fails.
type Kind = "local" | "session";

export const LOCAL_KEYS = [
  "amplop.profiles.v1",
  "amplop.lastProfile",
  "amplop.lang",
  "amplop.device",
  "amplop.openOrders",
  "amplop.seenDeposit",
  "amplop.emergency.v1",
  "amplop.recovery",
] as const;

const memory = new Map<string, string>();

function store(kind: Kind): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readItem(kind: Kind, key: string): string | null {
  try {
    return store(kind)?.getItem(key) ?? memory.get(`${kind}:${key}`) ?? null;
  } catch {
    return memory.get(`${kind}:${key}`) ?? null;
  }
}

export function writeItem(kind: Kind, key: string, value: string | null): void {
  memory.delete(`${kind}:${key}`);
  try {
    const s = store(kind);
    if (!s) throw new Error("no storage");
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    if (value !== null) memory.set(`${kind}:${key}`, value);
  }
}

export function readJson(kind: Kind, key: string): unknown {
  const raw = readItem(kind, key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
