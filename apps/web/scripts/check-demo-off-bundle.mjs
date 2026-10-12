// 15 S15-15: after a demo-off build, the browser bundle holds none of the demo controls' copy.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { filesToScan } from "./bundle-scan.mjs";

export const DEMO_STRINGS = [
  "Demo mode: payments are simulated",
  "Simulate payment (test mode)",
  "Demo only:",
  "Skip to next Monday",
];

export function demoHits(files) {
  const hits = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const s of DEMO_STRINGS) if (text.includes(s)) hits.push({ file: f, string: s });
  }
  return hits;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    console.error("check-demo-off-bundle: run it after a build with NEXT_PUBLIC_DEMO_MODE off");
    process.exit(1);
  }
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const files = filesToScan(join(root, ".next"));
  const hits = demoHits(files);
  for (const h of hits) console.log(`${h.file}: "${h.string}"`);
  console.log(`demo-off bundle: ${files.length} files, ${hits.length} hits`);
  if (files.length === 0 || hits.length > 0) process.exit(1);
}
