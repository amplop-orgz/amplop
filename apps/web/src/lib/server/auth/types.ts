// The contract's AccountInfo as viem decodes it (01 section 3).
import "server-only";

export type AccountInfo = {
  owner: `0x${string}`;
  trusted: `0x${string}`;
  split: readonly number[];
  pendingSplit: readonly number[];
  pendingSplitStartsAt: bigint;
  lockOn: boolean;
  everDeposited: boolean;
  requestSeq: bigint;
  skipSeconds: bigint;
};
