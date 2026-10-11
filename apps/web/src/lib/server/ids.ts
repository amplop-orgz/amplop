// The only way to make random ids (05 S05-51): 16 random bytes as 32 lowercase hex.
import "server-only";
import { randomBytes } from "node:crypto";

export function randomHex16(): string {
  return randomBytes(16).toString("hex");
}
