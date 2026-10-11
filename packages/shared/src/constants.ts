// Shared constants (01 section 9). GAS_FLOOR is the highest gas per write in `forge test --gas-report`
// plus 10% (spec 03 S03-51); update it in the same commit as any contract change.

export const FUND_THRESHOLD_ACTIONS = 3n;
export const FUND_TARGET_ACTIONS = 20n;
export const INDEXER_MAX_LAG_BLOCKS = 30;
export const INDEXER_TIMEOUT_MS = 4000;

export const GAS_FLOOR = {
  register: 143233n,
  saveSplit: 87598n,
  createInvite: 80480n,
  acceptInvite: 92274n,
  removeTrusted: 64564n,
  finishRemoveTrusted: 40155n,
  deposit: 274933n,
  authorize: 188180n,
  collect: 169856n,
  releaseHold: 71147n,
  refund: 90800n,
  movePurchase: 160151n,
  requestEmergency: 135530n,
  approveEmergency: 69592n,
  finalizeEmergency: 69315n,
  cancelEmergency: 33291n,
  startLockOff: 59882n,
  finishLockOff: 61493n,
  approveRecovery: 112704n,
  finishRecovery: 77963n,
  cancelPending: 40739n,
  skipDays: 34242n,
} as const satisfies Record<string, bigint>;

export type WriteFunction = keyof typeof GAS_FLOOR;

/** Largest floor among the functions a user signs (not the server's deposit and card calls). */
export const TYPICAL_ACTION_GAS = 160151n;
