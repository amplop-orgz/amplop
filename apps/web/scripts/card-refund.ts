// npm run -w apps/web card:refund -- --purchase <32 hex> [--amount <units>]   (09 S09-29, E18)
// Reads the same server env as the app (apps/web/.env.local or the shell). Runs refundPurchase directly.
import { parseArgs } from "node:util";
import { refundPurchase } from "../src/lib/server/card/holds";
import { closeDb } from "../src/lib/server/db";

const { values } = parseArgs({
  options: { purchase: { type: "string" }, amount: { type: "string" } },
});
if (!values.purchase || !/^[0-9a-f]{32}$/.test(values.purchase)) {
  console.error("usage: card:refund -- --purchase <32 hex> [--amount <units>]");
  process.exit(2);
}
if (values.amount !== undefined && !/^[1-9][0-9]*$/.test(values.amount)) {
  console.error("--amount must be a whole number of token units");
  process.exit(2);
}
try {
  const hash = await refundPurchase(
    values.purchase,
    values.amount === undefined ? undefined : BigInt(values.amount),
  );
  console.log(`refunded: ${hash}`);
} finally {
  await closeDb();
}
