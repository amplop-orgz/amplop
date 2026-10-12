// 15 S15-2: the browser and server demo flags must agree, so no build shows buttons whose routes 404.
import { fileURLToPath } from "node:url";

const on = (v) => v === "true";

export function flagError(env) {
  const browser = env.NEXT_PUBLIC_DEMO_MODE;
  const server = env.DEMO_MODE;
  const ok = (v) => v === undefined || v === "" || v === "true" || v === "false";
  if (!ok(browser) || !ok(server) || on(browser) !== on(server))
    return `NEXT_PUBLIC_DEMO_MODE (${String(browser)}) and DEMO_MODE (${String(server)}) must both be "true", or both unset or "false".`;
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const error = flagError(process.env);
  if (error) {
    console.error(`Demo flags disagree: ${error}`);
    process.exit(1);
  }
}
