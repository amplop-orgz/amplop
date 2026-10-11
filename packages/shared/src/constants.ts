// Shared constants (01 section 9). GAS_FLOOR is the highest gas per write in `forge test --gas-report`
// plus 10% (spec 03 S03-51); update it in the same commit as any contract change.

export const FUND_THRESHOLD_ACTIONS = 3n;
export const FUND_TARGET_ACTIONS = 20n;
export const INDEXER_MAX_LAG_BLOCKS = 30;
export const INDEXER_TIMEOUT_MS = 4000;

export const GAS_FLOOR = {
  register: 143257n,
  saveSplit: 87512n,
  createInvite: 55666n,
  acceptInvite: 92273n,
  removeTrusted: 62617n,
  finishRemoveTrusted: 40067n,
  deposit: 274933n,
  authorize: 188180n,
  collect: 169854n,
  releaseHold: 71172n,
  refund: 90751n,
  movePurchase: 160151n,
  requestEmergency: 135530n,
  approveEmergency: 69266n,
  finalizeEmergency: 69315n,
  cancelEmergency: 33291n,
  startLockOff: 59893n,
  finishLockOff: 61480n,
  approveRecovery: 112715n,
  finishRecovery: 67105n,
  cancelPending: 38266n,
  skipDays: 34267n,
} as const satisfies Record<string, bigint>;

export type WriteFunction = keyof typeof GAS_FLOOR;

/** Largest floor among the functions a user signs (not the server's deposit and card calls). */
export const TYPICAL_ACTION_GAS = 160151n;
