// Scans the browser build for server secrets (05 S05-52 to S05-55). Run by `npm run build`.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));

/** Values of the server secrets (05 S05-46 rule 3), with and without 0x. */
export const SECRET_NAMES = [
  "TREASURY_PRIVATE_KEY",
  "CARD_SERVICE_PRIVATE_KEY",
  "FEE_SPONSOR_PRIVATE_KEY",
  "MIDTRANS_SERVER_KEY",
  "CRON_SECRET",
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "ALERT_WEBHOOK_URL",
];

export function secretValues(env) {
  const out = [];
  for (const n of SECRET_NAMES) {
    const v = env[n];
    if (!v || v.length < 8) continue;
    out.push({ name: n, value: v });
    if (v.startsWith("0x")) out.push({ name: n, value: v.slice(2) });
  }
  return out;
}

export function loadAllow(text) {
  return new Set(
    text
      .split("\n")
      .map((l) => l.replace(/#.*/, "").trim().toLowerCase())
      .filter(Boolean),
  );
}

function walk(dir, exts, out) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => n.endsWith(e))) out.push(p);
  }
  return out;
}

export function filesToScan(nextDir) {
  return [
    ...walk(join(nextDir, "static"), [".js", ".css", ".map"], []),
    ...walk(join(nextDir, "server", "app"), [".html", ".rsc", ".body"], []),
  ];
}

const show = (s) => `${s.slice(0, 6)}…`;

/** Returns the hits in one file's text. Never returns a full value. */
export function scanText(text, { patterns, allow, secrets }) {
  const hits = [];
  for (const p of patterns) {
    const re = new RegExp(p.pattern, "g"); // nosemgrep -- patterns come from the committed patterns file, not input
    for (const m of text.matchAll(re)) {
      if (p.id === "hex32" && allow.has(m[0].toLowerCase())) continue;
      hits.push({ id: p.id, offset: m.index, preview: show(m[0]) });
    }
  }
  for (const s of secrets) {
    let at = text.indexOf(s.value);
    while (at !== -1) {
      hits.push({ id: `value:${s.name}`, offset: at, preview: show(s.value) });
      at = text.indexOf(s.value, at + 1);
    }
  }
  return hits;
}

export function scan({ files, patterns, allow, secrets, root }) {
  const hits = [];
  for (const f of files) {
    for (const h of scanText(readFileSync(f, "utf8"), { patterns, allow, secrets })) {
      hits.push({ file: relative(root, f), ...h });
    }
  }
  return hits;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(HERE, "..");
  const files = filesToScan(join(root, ".next"));
  const patterns = JSON.parse(readFileSync(join(HERE, "bundle-scan.patterns.json"), "utf8"));
  const allow = loadAllow(readFileSync(join(HERE, "bundle-scan.allow.txt"), "utf8"));
  const hits = scan({ files, patterns, allow, secrets: secretValues(process.env), root });
  for (const h of hits) console.log(`${h.file} ${h.id} at ${h.offset}: ${h.preview}`);
  console.log(`bundle scan: ${files.length} files, ${hits.length} hits`);
  if (files.length === 0 || hits.length > 0) process.exit(1);
}
