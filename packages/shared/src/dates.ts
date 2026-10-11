// Dates (06 S06-33). Screens follow the account clock, never the device clock. Day-only values
// (release days) are UTC dates; moments are shown in the device's time zone.

export type Lang = "en" | "id";

const LOCALE: Record<Lang, string> = { en: "en-US", id: "id-ID" };

/** The contract's `clock(accountId)` at read time, plus the seconds passed since (`performance.now()`). */
export function accountClockNow(
  clockRead: bigint,
  readAtMs: number,
  nowMs: number = performance.now(),
): number {
  return Number(clockRead) + Math.floor((nowMs - readAtMs) / 1000);
}

export function dayNumber(seconds: number): number {
  return Math.floor(seconds / 86400);
}

export function mondayNumber(day: number): number {
  return Math.floor((day + 3) / 7);
}

type Parts = Record<"weekday" | "day" | "month" | "year" | "hour" | "minute", string>;

function parts(seconds: number, lang: Lang, timeZone: string, month: "short" | "long"): Parts {
  const out: Partial<Parts> = {};
  const fmt = new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone,
    weekday: "short",
    day: "numeric",
    month,
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (const p of fmt.formatToParts(seconds * 1000)) {
    if (p.type in { weekday: 1, day: 1, month: 1, year: 1, hour: 1, minute: 1 })
      out[p.type as keyof Parts] = p.value;
  }
  return out as Parts;
}

function clean(s: string): string {
  return s.replace(/\.$/, "");
}

function time(p: Parts, lang: Lang): string {
  return `${p.hour}${lang === "id" ? "." : ":"}${p.minute}`;
}

/** `Mon, 12 Oct` / `Sen, 12 Okt`. Release days pass the default UTC zone. */
export function formatDay(seconds: number, lang: Lang, timeZone = "UTC"): string {
  const p = parts(seconds, lang, timeZone, "short");
  return `${clean(p.weekday)}, ${p.day} ${clean(p.month)}`;
}

/** `Wed, 7 Oct at 14:05` / `Rab, 7 Okt pukul 14.05`. */
export function formatDayTime(seconds: number, lang: Lang, timeZone?: string): string {
  const p = parts(seconds, lang, timeZone ?? localZone(), "short");
  return `${clean(p.weekday)}, ${p.day} ${clean(p.month)} ${lang === "id" ? "pukul" : "at"} ${time(p, lang)}`;
}

function localDay(seconds: number, timeZone: string): number {
  const p = parts(seconds, "en", timeZone, "short");
  return dayNumber(Date.UTC(Number(p.year), monthIndex(p.month), Number(p.day)) / 1000);
}

function monthIndex(shortEn: string): number {
  return [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].indexOf(shortEn);
}

/** `Today 14:05`, `Yesterday 09:12`, else the day and time. `now` is the account clock. */
export function formatRelative(
  seconds: number,
  now: number,
  lang: Lang,
  timeZone?: string,
): string {
  const tz = timeZone ?? localZone();
  const diff = localDay(now, tz) - localDay(seconds, tz);
  const p = parts(seconds, lang, tz, "short");
  if (diff === 0) return `${lang === "id" ? "Hari ini" : "Today"} ${time(p, lang)}`;
  if (diff === 1) return `${lang === "id" ? "Kemarin" : "Yesterday"} ${time(p, lang)}`;
  return formatDayTime(seconds, lang, tz);
}

/** `47 h 12 min`, `12 min` / `47 j 12 mnt`, `12 mnt`. */
export function formatDuration(seconds: number, lang: Lang): string {
  const total = Math.max(0, Math.floor(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const [hu, mu] = lang === "id" ? ["j", "mnt"] : ["h", "min"];
  return h > 0 ? `${h.toString()} ${hu} ${m.toString()} ${mu}` : `${m.toString()} ${mu}`;
}

/** `October 2026` / `Oktober 2026`. */
export function formatMonthYear(seconds: number, lang: Lang, timeZone?: string): string {
  const p = parts(seconds, lang, timeZone ?? localZone(), "long");
  return `${p.month} ${p.year}`;
}

function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
