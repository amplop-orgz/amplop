// Spec 17 unit tests: the landing page's copy in order, anchors and links, and the banned words (S17-9,
// S17-10) in the page, robots, sitemap and manifest.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Landing, { metadata } from "@/app/(marketing)/page";
import manifest from "@/app/manifest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

const html = renderToStaticMarkup(createElement(Landing));
const text = html
  .replace(/<[^>]+>/g, " ")
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

const BANNED = /crypto|blockchain|hackathon|monad|wallet|token|\bchain\b|\bgas\b|stablecoin|ausd/i;

describe("landing page (spec 17)", () => {
  it("has no banned word in the page, metadata, robots, sitemap or manifest", () => {
    for (const [what, s] of [
      ["page", html],
      ["metadata", JSON.stringify(metadata)],
      ["robots", JSON.stringify(robots())],
      ["sitemap", JSON.stringify(sitemap())],
      ["manifest", JSON.stringify(manifest())],
    ] as const)
      expect([what, BANNED.exec(s)?.[0] ?? null]).toEqual([what, null]);
  });

  it("shows every line of copy, in order", () => {
    const lines = [
      "Allowance that lasts the whole month.",
      "Parents send rupiah once. It arrives split into envelopes, and each envelope opens one week at a time.",
      "Food $400 $100 every Monday",
      "Emergency $100 Locked",
      "Four Mondays, four shares.",
      "Mon, 28 Sep $100 Released on arrival",
      "Mon, 19 Oct $100 Opens in two weeks",
      "The card knows which envelope pays.",
      "Supermarket Food pays",
      "Gambling site Declined",
      "Emergency needs a second yes.",
      "If they can't answer, it opens by itself after 48 hours.",
      "Raka asks to open Emergency $70,00 Laptop broke, needs repair before next week's exams. Approve with passkey Opens by itself on Fri, 9 Oct at 14:05",
      "Mama sees totals, not receipts.",
      "Emergency, locked $100,00",
      "From invite to first allowance in minutes.",
      "3 Rupiah in, envelopes filled",
      "Questions people ask.",
      "What if I lose my phone?",
      "Give the allowance a plan.",
      "Scan to open on your phone",
      "Amplop is open source under the MIT licence.",
      "Preview version: payments run in test mode and the card is a demo card. Amplop is not a bank.",
    ];
    let from = 0;
    for (const l of lines) {
      const at = text.indexOf(l, from);
      expect([l, at >= 0]).toEqual([l, true]);
      from = at;
    }
  });

  it("links the menu to its sections and every Open the app to /app", () => {
    for (const id of ["how", "safe", "faq"]) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`href="#${id}"`);
    }
    expect(html.match(/<a[^>]*href="\/app"[^>]*>Open the app<\/a>/g)).toHaveLength(3);
    expect(text.match(/Preview version:/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('aria-label="QR code that opens the app"');
  });
});
