// Plain sentences for every failure (06 S06-30, S06-35, S06-36). Raw error text never reaches the screen.
import { PasskeyCancelled, PasskeyFailed, PasskeyUnsupported } from "./account";
import { ApiError } from "./api";
import { ChainError, NotFunded, TxTimeout } from "./chain/write";

/** Contract errors that share a sentence; every other ABI error has its own key or the generic one. */
export const CHAIN_ERROR_KEY: Record<string, string> = {
  NoAccount: "chainError.NotOwner",
  NotOwner: "chainError.NotOwner",
  NoInvite: "chainError.BadSignature",
  BadSignature: "chainError.BadSignature",
  PurchaseNotFound: "chainError.NotMovable",
  NotFromEveryday: "chainError.NotMovable",
  AlreadyMoved: "chainError.NotMovable",
  InvalidTarget: "chainError.NotMovable",
  NothingToMove: "chainError.NotMovable",
};

export const SERVER_ONLY_ERRORS = new Set([
  "NotTreasury",
  "NotCardService",
  "PaymentAlreadyUsed",
  "PurchaseIdUsed",
  "NotHeld",
  "AmountAboveHeld",
  "HoldExpired",
  "HoldNotExpired",
  "NotCollected",
  "RefundTooLarge",
  "AmountTooLarge",
  "InvalidId",
  "TooManySchedules",
  "TransferMismatch",
  "ZeroAddress",
  "TokenDecimalsUnreadable",
]);

export function chainErrorKey(name: string): string {
  if (CHAIN_ERROR_KEY[name]) return CHAIN_ERROR_KEY[name];
  if (
    SERVER_ONLY_ERRORS.has(name) ||
    /^(ERC20|ECDSA|ReentrancyGuard|SafeERC20|SafeCast|Address|InvalidShortString|StringTooLong)/.test(
      name,
    )
  )
    return "error.generic";
  return `chainError.${name}`;
}

export function isOffline(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (e instanceof ApiError) return e.status === 0;
  if (e instanceof TypeError && /fetch/i.test(e.message)) return true;
  return e instanceof Error && ["HttpRequestError", "TimeoutError"].includes(e.name);
}

/** The i18n key for an error; `has` tells whether a key exists, so unknown codes fall back cleanly. */
export function errorKey(e: unknown, has: (key: string) => boolean): string {
  if (e instanceof PasskeyCancelled) return "error.passkeyCancelled";
  if (e instanceof PasskeyUnsupported) return "error.passkeyUnsupported";
  if (e instanceof PasskeyFailed) return "error.passkeyFailed";
  if (e instanceof NotFunded) {
    if (e.code.startsWith("fund_limit") || e.code === "fund_daily_cap") return "fund.limit";
    return "fund.unavailable";
  }
  if (isOffline(e)) return "error.offline";
  if (e instanceof ApiError) {
    const k = `apiError.${e.code}`;
    return has(k) ? k : "error.generic";
  }
  if (e instanceof ChainError) {
    if (e.reverted && e.errorName === "unknown") return "error.reverted";
    const k = chainErrorKey(e.errorName);
    return has(k) ? k : "error.generic";
  }
  if (e instanceof TxTimeout) return "error.generic";
  return "error.generic";
}
