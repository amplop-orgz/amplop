// Names (06 S06-31). The client and the server use the same rule.

export type NameResult =
  { ok: true; value: string } | { ok: false; reason: "empty" | "too_long" | "bad_chars" };

export const NAME_MAX_GRAPHEMES = 60;

// Control characters, line and paragraph separators, and bidi overrides.
const BAD = /[\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069]/u;

export function graphemeCount(s: string): number {
  return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)).length;
}

export function normalizeName(raw: string): NameResult {
  // Leading and trailing white space is trimmed first; a control character left inside is refused.
  const trimmed = raw.normalize("NFC").trim();
  if (BAD.test(trimmed)) return { ok: false, reason: "bad_chars" };
  const value = trimmed.replace(/\s+/gu, " ");
  if (value === "") return { ok: false, reason: "empty" };
  if (graphemeCount(value) > NAME_MAX_GRAPHEMES) return { ok: false, reason: "too_long" };
  return { ok: true, value };
}

/** "Raka Pratama" → "Raka". */
export function shortName(name: string): string {
  const i = name.indexOf(" ");
  return i === -1 ? name : name.slice(0, i);
}
