// The demo shops (09 S09-3). The server does not check these: a real issuer can send any shop.
import type { ShopCurrency } from "@amplop/shared/money";

export type Shop = {
  slug: string;
  label: string;
  merchantName: string;
  city: string;
  mcc: number;
  typeLabel: string;
  currency: ShopCurrency;
  defaultMinor: bigint;
  onCardScreen: boolean;
};

export const DEMO_SHOPS: readonly Shop[] = [
  {
    slug: "supermarket",
    label: "Supermarket",
    merchantName: "Supermarket",
    city: "Amsterdam",
    mcc: 5411,
    typeLabel: "Groceries",
    currency: "EUR",
    defaultMinor: 1250n,
    onCardScreen: true,
  },
  {
    slug: "tram",
    label: "Tram and train",
    merchantName: "Tram and train",
    city: "Amsterdam",
    mcc: 4111,
    typeLabel: "Public transport",
    currency: "EUR",
    defaultMinor: 340n,
    onCardScreen: true,
  },
  {
    slug: "bookshop",
    label: "Bookshop",
    merchantName: "Bookshop",
    city: "Amsterdam",
    mcc: 5942,
    typeLabel: "Bookshop",
    currency: "EUR",
    defaultMinor: 1800n,
    onCardScreen: true,
  },
  {
    slug: "cinema",
    label: "Cinema",
    merchantName: "Cinema",
    city: "Amsterdam",
    mcc: 7832,
    typeLabel: "Cinema",
    currency: "EUR",
    defaultMinor: 1100n,
    onCardScreen: true,
  },
  {
    slug: "gambling",
    label: "Gambling site",
    merchantName: "Gambling site",
    city: "Online",
    mcc: 7995,
    typeLabel: "Gambling",
    currency: "EUR",
    defaultMinor: 2000n,
    onCardScreen: true,
  },
  {
    slug: "webshop",
    label: "Web shop",
    merchantName: "Web shop",
    city: "Online",
    mcc: 5999,
    typeLabel: "Online shop",
    currency: "USD",
    defaultMinor: 500n,
    onCardScreen: false,
  },
];

export function shopBySlug(slug: string | null): Shop | undefined {
  return DEMO_SHOPS.find((s) => s.slug === slug);
}

/** The category word for a blocked shop type (09 S09-23). */
export function blockedCategory(mcc: number): string | null {
  return mcc === 7995 ? "gambling" : null;
}

export type AmountCheck =
  { ok: true; minor: bigint } | { ok: false; reason: "empty" | "zero" | "precision" | "invalid" };

/** 09 S09-6: EUR and USD take a comma and up to two decimals; IDR whole rupiah only. */
export function parseShopAmount(text: string, currency: ShopCurrency): AmountCheck {
  const t = text.replace(/[€$]|Rp/g, "").trim();
  if (t === "") return { ok: false, reason: "empty" };
  if (/[^0-9.,]/.test(t)) return { ok: false, reason: "invalid" };
  const [whole = "", frac = "", ...rest] = t.split(",");
  if (rest.length > 0) return { ok: false, reason: "invalid" };
  const digits = whole.replace(/\./g, "");
  if (digits === "" && frac === "") return { ok: false, reason: "invalid" };
  if (!/^\d*$/.test(digits) || !/^\d*$/.test(frac)) return { ok: false, reason: "invalid" };
  if (currency === "IDR" && t.includes(",")) return { ok: false, reason: "invalid" };
  if (frac.length > 2) return { ok: false, reason: "precision" };
  const minor =
    currency === "IDR"
      ? BigInt(digits || "0")
      : BigInt(digits || "0") * 100n + BigInt(frac.padEnd(2, "0") || "0");
  if (minor === 0n) return { ok: false, reason: "zero" };
  return { ok: true, minor };
}

/** Thousands dots added as the user types (09 S09-6); the comma part is kept as typed. */
export function groupTyped(text: string, currency: ShopCurrency): string {
  const t = text.replace(/[^0-9,]/g, "");
  const [whole = "", ...frac] = currency === "IDR" ? [t.replace(/,/g, "")] : t.split(",");
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return frac.length ? `${grouped},${frac.join("")}` : grouped;
}

export function minorToTyped(minor: bigint, currency: ShopCurrency): string {
  if (currency === "IDR") return groupTyped(minor.toString(), currency);
  return groupTyped(
    `${(minor / 100n).toString()},${(minor % 100n).toString().padStart(2, "0")}`,
    currency,
  );
}

export const CURRENCY_SIGN: Record<ShopCurrency, string> = { EUR: "€", USD: "$", IDR: "Rp" };
