// 18 S18-3: the PRD 13 wording rules a machine can check, over README, SECURITY.md, CONTRIBUTING.md,
// the docs pages and fragments, and submission/ (20). Prints file, line and rule for each hit.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fail, isMain } from "./lib.mjs";

export const CLAIM =
  "We reviewed eight stablecoin cards launched or announced by October 2026. On their public pages, none offered purpose envelopes, timed release, or a second person who can approve.";
export const FIVE = [
  "Money split into envelopes on arrival.",
  "Weekly release.",
  "The contract itself deciding each card payment.",
  "A trusted person who can open Emergency but cannot block it.",
  "A parent who sees totals, not shops.",
];
const ALLOWED_PRIVATE = ["private vulnerability reporting", "Private text, profile, card"];
const DOCS = "apps/docs/src/content/docs";

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(md|mdx|txt)$/.test(n)) out.push(p);
  }
  return out;
}

export function scope() {
  return [
    ...["README.md", "SECURITY.md", "CONTRIBUTING.md"].filter((f) => existsSync(f)),
    ...walk(DOCS),
    ...walk("apps/docs/src/fragments"),
    ...walk("submission"),
  ];
}

/** Text outside code blocks and code spans, one entry per line. */
function prose(text) {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => l.replace(/`[^`]*`/g, " "));
}

const FOOTNOTE =
  /<!-- footnote:reviewed-cards:start -->[\s\S]*?<!-- footnote:reviewed-cards:end -->/g;

export function check(files, read) {
  const hits = [];
  const add = (file, line, rule) => hits.push(`${file}:${String(line)}: ${rule}`);
  const names = read("apps/docs/src/fragments/reviewed-cards.txt").split("\n").filter(Boolean);
  let principleDocs = 0;
  let claims = 0;
  for (const file of files) {
    if (file.endsWith("reviewed-cards.txt")) continue;
    const text = read(file);
    const lines = prose(text);
    lines.forEach((l, i) => {
      const n = i + 1;
      if (/innovat/i.test(l)) add(file, n, "never call it an innovation");
      if (/audited/i.test(l))
        add(file, n, 'say "self-reviewed, findings published", never "audited"');
      if (/\bprivacy\b/i.test(l))
        add(file, n, 'never "privacy": say "the parent sees totals, not shops"');
      let rest = l;
      for (const a of ALLOWED_PRIVATE) rest = rest.replace(new RegExp(a, "gi"), "");
      if (/\bprivate\b(?!\s+keys?\b)/i.test(rest))
        add(file, n, 'never "private" as a claim (only "private key")');
    });
    const outside = text.replace(FOOTNOTE, "");
    outside.split("\n").forEach((l, i) => {
      for (const name of names)
        if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(l))
          add(file, i + 1, `reviewed card "${name}" named outside the footnote`);
    });
    const c = text.split(CLAIM).length - 1;
    claims += c;
    if (c > 0 && !file.endsWith("how-amplop-differs.md"))
      add(file, 0, "the claim sentence belongs only on How Amplop differs");
    const p = (text.match(/<!-- principle:crypto-free -->/g) ?? []).length;
    if (file === "README.md" && p !== 1)
      add(file, 0, "the crypto-free principle must appear exactly once in README");
    if (file.startsWith(DOCS)) principleDocs += p;
  }
  if (files.some((f) => f.startsWith(DOCS))) {
    if (principleDocs !== 1)
      add(
        DOCS,
        0,
        `the crypto-free principle appears ${String(principleDocs)} times on the docs site, not once`,
      );
    if (claims !== 1) add(DOCS, 0, `the claim sentence appears ${String(claims)} times, not once`);
  }
  if (files.includes("README.md")) {
    const readme = read("README.md");
    for (const line of FIVE)
      if (!readme.includes(line)) add("README.md", 0, `missing what-is-new line: ${line}`);
    if (!readme.includes("the parent sees totals, not shops"))
      add("README.md", 0, 'missing "the parent sees totals, not shops"');
    if (!readme.includes("self-reviewed, findings published"))
      add("README.md", 0, 'missing "self-reviewed, findings published"');
  }
  const overview = `${DOCS}/index.mdx`;
  if (files.includes(overview) && !read(overview).includes("the parent sees totals, not shops"))
    add(overview, 0, 'missing "the parent sees totals, not shops"');
  return hits;
}

if (isMain(import.meta)) {
  const hits = check(scope(), (f) => readFileSync(f, "utf8"));
  if (hits.length) fail(hits);
  console.log("wording ok");
}
