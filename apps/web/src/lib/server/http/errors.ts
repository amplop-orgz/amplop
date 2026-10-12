// Error codes and the one error shape (05 S05-20). Feature specs register their codes here.
import "server-only";

export type Status = 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502;

const AUTH = "Your request could not be checked. Please try again.";
const INPUT = "Some details in the request are not valid.";

export const CODES = {
  bad_json: [400, INPUT],
  bad_input: [400, INPUT],
  bad_content_type: [400, INPUT],
  body_too_large: [400, "This request is too large."],
  auth_missing: [401, AUTH],
  auth_malformed: [401, AUTH],
  auth_wrong_site: [401, AUTH],
  auth_wrong_chain: [401, AUTH],
  auth_wrong_action: [401, AUTH],
  auth_expired: [401, AUTH],
  auth_future: [401, AUTH],
  auth_body_mismatch: [401, AUTH],
  auth_bad_signature: [401, AUTH],
  cron_unauthorized: [401, "Not allowed."],
  not_owner: [403, "Only the account owner can do this."],
  not_trusted: [403, "Only the trusted person can do this."],
  not_allowed: [403, "You can't see this account."],
  wrong_account: [403, "This request is for a different account."],
  bad_origin: [403, "This request must come from the Amplop app."],
  not_found: [404, "Not found."],
  nonce_invalid: [409, "This request was already used or has expired. Please try again."],
  rate_limited: [429, "Too many requests. Please wait a moment."],
  internal: [500, "Something went wrong. Please try again."],
  chain_unavailable: [502, "We could not reach the network. Please try again."],
  chain_busy: [502, "The network is busy. Please try again."],
  // 07
  bad_device: [400, INPUT],
  address_mismatch: [403, "You can only get your own account ready."],
  fund_limit_address: [
    429,
    "Today's limit for getting accounts ready was reached. Try again tomorrow.",
  ],
  fund_limit_device: [
    429,
    "Today's limit for getting accounts ready was reached. Try again tomorrow.",
  ],
  fund_limit_ip: [429, "Today's limit for getting accounts ready was reached. Try again tomorrow."],
  fund_daily_cap: [
    429,
    "Today's limit for getting accounts ready was reached. Try again tomorrow.",
  ],
  fund_unavailable: [502, "We can't get your account ready right now. Try again in a few minutes."],
  name_invalid: [400, "Use 1 to 60 characters, without hidden formatting characters."],
  profile_not_found: [404, "No name is saved for this account yet."],
  // 10
  invite_not_found: [404, "This invite is not valid."],
  invite_not_on_chain: [409, "This invite isn't on record yet. Try again."],
  invite_used: [409, "This invite has already been used."],
  // 09
  card_not_found: [404, "This card is not active."],
  amount_too_small: [400, "This amount is too small."],
  amount_too_large: [400, "This is above the demo card's limit of $10.000,00."],
  amount_above_hold: [400, "The shop can't collect more than the hold."],
  idempotency_conflict: [409, "This payment was already sent with different details."],
  purchase_in_progress: [409, "This payment is still being checked. Please wait a moment."],
  not_held: [409, "This purchase is no longer on hold."],
  authorize_failed: [500, "Nothing was charged. Please try again later."],
  payment_unconfirmed: [
    502,
    "We couldn't confirm this payment yet. Try again in a moment; you won't be charged twice.",
  ],
} as const satisfies Record<string, readonly [Status, string]>;

export type Code = keyof typeof CODES;

export class ApiError extends Error {
  readonly status: Status;
  readonly code: string;
  retryAfter?: number;
  constructor(status: Status, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Throws-ready error for a registered code. */
export function apiError(code: Code): ApiError {
  const [status, message] = CODES[code];
  return new ApiError(status, code, message);
}

export function notFound(): never {
  throw apiError("not_found");
}
