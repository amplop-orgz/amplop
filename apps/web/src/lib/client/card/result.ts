// What checkout hands the result screen (09 S09-21), kept in memory only. A reload rebuilds the same
// content from the chain (the receipt of `tx`) and GET /api/purchases.
import type { ShopCurrency } from "@amplop/shared/money";

export type AuthorizeResponse = {
  purchaseId: string;
  result: "approved" | "declined";
  envelope?: "food" | "transport" | "study" | "everyday";
  everydayStepIn: boolean;
  reason?: "blocked" | "not_enough";
  amountUnits: string;
  txHash: string;
  confirmMs: number | null;
};

export type ShopLine = {
  merchantName: string;
  merchantCity: string;
  currency: ShopCurrency;
  amountMinor: bigint;
  mcc: number;
};

const handed = new Map<string, { response: AuthorizeResponse; shop: ShopLine }>();

export function handOff(response: AuthorizeResponse, shop: ShopLine): void {
  handed.set(response.purchaseId, { response, shop });
}

export function takeHandOff(purchaseId: string) {
  return handed.get(purchaseId);
}

export const ENVELOPE_INDEX = { food: 0, transport: 1, study: 2, everyday: 3 } as const;
