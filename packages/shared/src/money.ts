// Money formats (01 section 8, 06 S06-32). Everything is bigint; display uses a dot for thousands
// and a comma for decimals in both languages, so this file never uses Intl.NumberFormat.

export const SAMPLE_RATE_IDR_PER_USD = 16500n;
export const SAMPLE_RATE_USD_PER_EUR = { num: 11511n, den: 10000n } as const;

const MINUS = "−";

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Divides and rounds half up; both values must be non-negative. */
function divRound(n: bigint, d: bigint): bigint {
  return (n * 2n + d) / (2n * d);
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/** `1_000_000_000n, 6` → `$1.000,00`; cents rounded half up; negative → `−$14,39`. */
export function formatUsd(units: bigint, decimals: number): string {
  const sign = units < 0n ? MINUS : "";
  const abs = units < 0n ? -units : units;
  const cents = decimals >= 2 ? divRound(abs, pow10(decimals - 2)) : abs * pow10(2 - decimals);
  const whole = (cents / 100n).toString();
  const frac = (cents % 100n).toString().padStart(2, "0");
  return `${sign}$${group(whole)},${frac}`;
}

/** `16_500_000n` → `Rp16.500.000`. */
export function formatRupiah(rupiah: bigint): string {
  const sign = rupiah < 0n ? MINUS : "";
  return `${sign}Rp${group((rupiah < 0n ? -rupiah : rupiah).toString())}`;
}

/** Rounds to the nearest `step` (half up): `2_050_125n` → `Rp2.050.000`. */
export function formatRupiahRounded(rupiah: bigint, step = 1000n): string {
  return formatRupiah(divRound(rupiah, step) * step);
}

/** `10_887_690n` → `Rp10,9 million` / `Rp10,9 juta`; under a million falls back to the rounded form. */
export function formatRupiahCompact(rupiah: bigint, lang: "en" | "id"): string {
  if (rupiah < 1_000_000n) return formatRupiahRounded(rupiah);
  const billion = rupiah >= 1_000_000_000n;
  const unit = billion ? 1_000_000_000n : 1_000_000n;
  const tenths = divRound(rupiah * 10n, unit);
  const whole = group((tenths / 10n).toString());
  const frac = tenths % 10n;
  const word = billion
    ? lang === "id"
      ? "miliar"
      : "billion"
    : lang === "id"
      ? "juta"
      : "million";
  return `Rp${whole}${frac === 0n ? "" : `,${frac.toString()}`} ${word}`;
}

/** `1250n` → `€12,50`. */
export function formatEur(minor: bigint): string {
  return `€${group((minor / 100n).toString())},${(minor % 100n).toString().padStart(2, "0")}`;
}

export function formatPercent(n: number): string {
  return `${n.toString()}%`;
}

/** `floor(rupiah × 10^decimals / rate)` (PRD 15: always round down). */
export function rupiahToUnits(
  rupiah: bigint,
  decimals: number,
  rate = SAMPLE_RATE_IDR_PER_USD,
): bigint {
  return (rupiah * pow10(decimals)) / rate;
}

/** `floor(minor × rate × 10^decimals / 100)`, the rate as an integer fraction. */
export function eurMinorToUnits(
  minor: bigint,
  decimals: number,
  rate: { num: bigint; den: bigint } = SAMPLE_RATE_USD_PER_EUR,
): bigint {
  return (minor * rate.num * pow10(decimals)) / (rate.den * 100n);
}

export type ParsedDecimal =
  { ok: true; minor: bigint } | { ok: false; reason: "empty" | "invalid" | "too_precise" };

/**
 * Parses typed money. With a comma, the comma is the decimal mark and dots group thousands.
 * Without one, a dot followed by 1 or 2 final digits is the decimal mark (decimals > 0 only).
 */
export function parseDecimalInput(text: string, decimals: number): ParsedDecimal {
  const s = text.trim();
  if (s === "") return { ok: false, reason: "empty" };
  if (!/^[0-9.,]+$/.test(s) || (s.match(/,/g) ?? []).length > 1)
    return { ok: false, reason: "invalid" };
  let intPart: string;
  let fracPart = "";
  if (s.includes(",")) {
    const [a = "", b = ""] = s.split(",");
    intPart = a.replace(/\./g, "");
    fracPart = b;
    if (b.includes(".") || b === "") return { ok: false, reason: "invalid" };
  } else {
    const m = decimals > 0 ? /^(.*)\.(\d{1,2})$/.exec(s) : null;
    intPart = (m ? (m[1] ?? "") : s).replace(/\./g, "");
    fracPart = m ? (m[2] ?? "") : "";
  }
  if (intPart === "" && fracPart === "") return { ok: false, reason: "invalid" };
  if (!/^\d*$/.test(intPart)) return { ok: false, reason: "invalid" };
  if (fracPart.length > decimals) return { ok: false, reason: "too_precise" };
  const minor =
    BigInt(intPart === "" ? "0" : intPart) * pow10(decimals) +
    BigInt((fracPart || "0").padEnd(decimals, "0"));
  return { ok: true, minor };
}

/** `floor(cents × 10^decimals / 100)`: a shop priced in dollars is not converted (09 S09-11, E20). */
export function usdCentsToUnits(cents: bigint, decimals: number): bigint {
  return (cents * pow10(decimals)) / 100n;
}

export type ShopCurrency = "EUR" | "USD" | "IDR";

export type Rates = { idrPerUsd: bigint; usdPerEur: { num: bigint; den: bigint } };

export const SAMPLE_RATES: Rates = {
  idrPerUsd: SAMPLE_RATE_IDR_PER_USD,
  usdPerEur: SAMPLE_RATE_USD_PER_EUR,
};

/** A shop amount in its currency's minor units (IDR: whole rupiah) to token units, rounding down (R14). */
export function shopAmountToUnits(
  currency: ShopCurrency,
  minor: bigint,
  decimals: number,
  rates: Rates = SAMPLE_RATES,
): bigint {
  if (currency === "EUR") return eurMinorToUnits(minor, decimals, rates.usdPerEur);
  if (currency === "USD") return usdCentsToUnits(minor, decimals);
  return rupiahToUnits(minor, decimals, rates.idrPerUsd);
}

/** `€12,50`, `$5,00`, `Rp16.500`: a shop's own price. */
export function formatShopAmount(currency: ShopCurrency, minor: bigint): string {
  if (currency === "EUR") return formatEur(minor);
  if (currency === "IDR") return formatRupiah(minor);
  return formatUsd(minor, 2);
}
