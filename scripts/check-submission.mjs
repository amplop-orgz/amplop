// 20 S20-7: the judge access steps in submission/portal.md equal the docs Try it page (18 S18-14).
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

/** The numbered steps of a page, one string each. */
export function steps(text) {
  return [...text.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1].trim());
}

export function check(read) {
  const portal = /<!-- try-it:start -->([\s\S]*?)<!-- try-it:end -->/.exec(
    read("submission/portal.md"),
  )?.[1];
  if (portal === undefined) return ["submission/portal.md has no try-it:start / try-it:end block"];
  const want = steps(read("apps/docs/src/content/docs/try-it.mdx"));
  const got = steps(portal);
  if (want.length === 0) return ["the docs Try it page has no numbered steps"];
  return JSON.stringify(got) === JSON.stringify(want)
    ? []
    : [
        "submission/portal.md judge steps differ from apps/docs/src/content/docs/try-it.mdx; copy them again",
      ];
}

if (isMain(import.meta)) {
  const errors = check((f) => readFileSync(f, "utf8"));
  if (errors.length) fail(errors);
  console.log("submission ok");
}
