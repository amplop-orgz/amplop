// 18 S18-13: every API route file is documented on api.mdx as "METHOD /api/path", and every endpoint
// documented there has a route file.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, isMain } from "./lib.mjs";

const ROOT = "apps/web/src/app/api";

export function routes(dir = ROOT, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) routes(p, out);
    else if (e.name === "route.ts" && !p.includes("[...slug]")) {
      const path = `/api/${p.slice(ROOT.length + 1, -"/route.ts".length)}`;
      for (const m of readFileSync(p, "utf8").matchAll(/export const (GET|POST)\b/g))
        out.push(`${m[1]} ${path}`);
    }
  }
  return out.sort();
}

export function check(found, page) {
  const documented = [...page.matchAll(/`(GET|POST) (\/api\/[^`\s]+)`/g)].map(
    (m) => `${m[1]} ${m[2]}`,
  );
  return [
    ...found.filter((r) => !documented.includes(r)).map((r) => `api.mdx: missing ${r}`),
    ...[...new Set(documented)]
      .filter((d) => !found.includes(d))
      .map((d) => `api.mdx: ${d} has no route file`),
  ];
}

if (isMain(import.meta)) {
  const errors = check(routes(), readFileSync("apps/docs/src/content/docs/api.mdx", "utf8"));
  if (errors.length) fail(errors);
  console.log("docs api ok");
}
