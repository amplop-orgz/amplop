// Fee top-up limits (07 S07-27). "Day" is the server's UTC date, never an account clock.
import "server-only";
import { parseEther } from "viem";

export type FundLimits = {
  addressPerDay: number;
  newAddressesPerDevicePerDay: number;
  perIpPerDay: number;
  dailyCapWei: bigint;
  reserveFloorWei: bigint;
};

export const FUND_LIMITS: FundLimits = {
  addressPerDay: 5,
  newAddressesPerDevicePerDay: 20,
  perIpPerDay: 30,
  dailyCapWei: parseEther("50"),
  reserveFloorWei: parseEther("10"),
};

export const TRANSFER_GAS = 21_000n;
