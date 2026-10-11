// TypeScript mirrors of the contract enums (01 section 3). Same order and values.

export enum Envelope {
  Food = 0,
  Transport = 1,
  Study = 2,
  Everyday = 3,
  Emergency = 4,
}

export enum PurchaseState {
  None = 0,
  Held = 1,
  Collected = 2,
  Released = 3,
  Refunded = 4,
}

export enum DeclineReason {
  None = 0,
  Blocked = 1,
  NotEnough = 2,
}

export enum PendingKind {
  Split = 0,
  TrustedRemoval = 1,
  LockOff = 2,
  Recovery = 3,
}

export enum EmergencyStatus {
  None = 0,
  Open = 1,
  Opened = 2,
  Cancelled = 3,
}

export enum OpenedBy {
  Approval = 0,
  Time = 1,
}
