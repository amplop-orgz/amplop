// Reserve-balance constants (05 S05-42, PRD 6). The fee sponsor alerts below 60 MON, the treasury
// below 12 MON and the card service below 15 MON.
import "server-only";
import { parseEther } from "viem";
import type { Role } from "./types";

export const RESERVE_WEI = parseEther("10");

export const DAILY_BUDGET_WEI: Record<Role, bigint> = {
  feeSponsor: parseEther("50"),
  treasury: parseEther("2"),
  cardService: parseEther("5"),
};
