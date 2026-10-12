// Board 0.0 Landing at `/` (spec 17). A server component: no client JavaScript of its own, nothing read
// from the contract, server or indexer, and no demo banner. Copy is exact (S17-2).
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CardLines, Qr, SectionLines } from "@/components/landing/Art";
import { Logo } from "@/components/ui/Logo";

const TITLE = "Amplop: allowance that lasts the whole month";
const DESCRIPTION =
  "Parents send rupiah once. It arrives split into envelopes, and each envelope opens one week at a time.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Amplop",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/opengraph-image.png"],
  },
};

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const DOCS = process.env.NEXT_PUBLIC_DOCS_URL || null;
const REPO = process.env.NEXT_PUBLIC_REPO_URL || null;
const VIDEO = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL || null;

const WRAP = "mx-auto max-w-[1200px] px-4 min-[480px]:px-8";
const DISPLAY = "m-0 font-display font-extrabold";
const H2 = `${DISPLAY} text-[clamp(2rem,4.6vw,3.75rem)] leading-none tracking-[-0.03em]`;
const PILL = "flex items-center rounded-full font-bold no-underline";

const FAN = [
  {
    name: "Food",
    amount: "$400",
    line: "$100 every Monday",
    bg: "bg-food",
    tilt: "translate-y-[54px] -rotate-[14deg]",
  },
  {
    name: "Transport",
    amount: "$150",
    line: "$37,50 every Monday",
    bg: "bg-transport",
    tilt: "translate-y-[14px] -rotate-[7deg]",
  },
  { name: "Study", amount: "$150", line: "$37,50 every Monday", bg: "bg-study", tilt: "" },
  {
    name: "Everyday",
    amount: "$200",
    line: "$50 every Monday",
    bg: "bg-everyday",
    tilt: "translate-y-[14px] rotate-[7deg]",
  },
  {
    name: "Emergency",
    amount: "$100",
    line: "Locked",
    bg: "bg-emergency",
    tilt: "translate-y-[54px] rotate-[14deg]",
  },
];

const TILES = [
  { date: "Mon, 28 Sep", state: "Released on arrival", filled: true },
  { date: "Mon, 5 Oct", state: "Released", filled: true },
  { date: "Mon, 12 Oct", state: "Opens on Monday", filled: false },
  { date: "Mon, 19 Oct", state: "Opens in two weeks", filled: false },
];

const SHOPS = [
  { shop: "Supermarket", pill: "Food pays", bg: "bg-food" },
  { shop: "Tram and train", pill: "Transport pays", bg: "bg-transport" },
  { shop: "Bookshop", pill: "Study pays", bg: "bg-study" },
  { shop: "Cinema", pill: "Everyday pays", bg: "bg-everyday" },
  { shop: "Gambling site", pill: "Declined", bg: "bg-emergency" },
];

const TOTALS = [
  { name: "Food", amount: "$244,61", bg: "bg-food" },
  { name: "Transport", amount: "$101,25", bg: "bg-transport" },
  { name: "Study", amount: "$105,00", bg: "bg-study" },
  { name: "Everyday", amount: "$109,00", bg: "bg-everyday" },
  { name: "Emergency, locked", amount: "$100,00", bg: "bg-emergency" },
];

const STEPS = [
  ["Set your envelopes", "Create a passkey and choose how each allowance is split."],
  ["Invite your parent", "Send one link by WhatsApp. They create their own passkey."],
  ["Rupiah in, envelopes filled", "They pay by bank transfer in rupiah. It arrives already split."],
];

const QUESTIONS = [
  [
    "Where is my money kept?",
    "As digital dollars, held under envelope rules that are public, so anyone can check that they do what this page says.",
  ],
  [
    "Where does the card work?",
    "In shops and online, wherever cards are accepted. Each payment is taken from the envelope that matches the kind of shop.",
  ],
  [
    "Why is my balance in dollars?",
    "The rupiah is converted once, on the day your parent pays. After that the amount stays the same, whatever the exchange rate does.",
  ],
  [
    "Can my parent see what I buy?",
    "No. They see each envelope's total and alerts in the app, for example when a blocked purchase is tried. They never see the shop.",
  ],
  [
    "What if my trusted person doesn't answer?",
    "The Emergency envelope opens automatically 48 hours after you ask.",
  ],
  [
    "What if I lose my phone?",
    "Your passkey is saved in your phone's password manager, so it comes back when you sign in on a new phone. If the passkey itself is lost, your trusted person can approve a new one, which takes 48 hours.",
  ],
];

function Split({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className={`${WRAP} flex flex-wrap gap-x-16 gap-y-10 pt-[88px] pb-24`}>
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-[18px]">{left}</div>
      <div className="flex min-w-0 flex-[1.4_1_480px] flex-col">{right}</div>
    </div>
  );
}

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

export default function Landing() {
  return (
    <div className="text-[18px] leading-[1.5]">
      <header className={`${WRAP} flex flex-wrap items-center justify-between gap-3 py-5`}>
        <Link href="/" aria-label="Amplop home" className="flex min-h-11 items-center">
          <Logo height={34} decorative />
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-[16px] font-semibold">
          <a href="#how" className="flex min-h-11 items-center px-3 text-ink no-underline">
            How it works
          </a>
          <a href="#safe" className="flex min-h-11 items-center px-3 text-ink no-underline">
            Emergency
          </a>
          <a href="#faq" className="flex min-h-11 items-center px-3 text-ink no-underline">
            Questions
          </a>
          {DOCS ? (
            <a href={DOCS} className="flex min-h-11 items-center px-3 text-ink no-underline">
              Docs
            </a>
          ) : null}
          <Link href="/app" className={`${PILL} ml-2 min-h-11 bg-ink px-[22px] text-white`}>
            Open the app
          </Link>
        </nav>
      </header>

      <main>
        <section className={`${WRAP} flex flex-col gap-7 pt-12`}>
          <h1
            className={`${DISPLAY} text-[clamp(2.9rem,9.4vw,8.25rem)] leading-[0.93] tracking-[-0.04em]`}
          >
            Allowance that lasts the whole month.
          </h1>
          <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
            <p className="m-0 max-w-[520px] text-[21px] leading-[1.4]">{DESCRIPTION}</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link href="/app" className={`${PILL} min-h-[60px] bg-ink px-[34px] text-white`}>
                Open the app
              </Link>
              {VIDEO ? (
                <a
                  href={VIDEO}
                  {...external}
                  className="flex min-h-11 items-center font-bold text-ink"
                >
                  Watch the demo
                </a>
              ) : null}
            </div>
          </div>
        </section>

        <section
          aria-label="Five envelopes: Food, Transport, Study, Everyday and Emergency"
          className="mt-9 flex h-[400px] justify-center overflow-hidden pt-11"
        >
          {FAN.map((c, i) => (
            <div
              key={c.name}
              className={`relative flex h-[400px] flex-[0_0_250px] origin-bottom flex-col gap-0.5 overflow-hidden rounded-[16px] px-6 py-[26px] text-white outline-4 outline-ground ${c.bg} ${c.tilt} ${i > 0 ? "-ml-[62px]" : ""}`}
            >
              <CardLines />
              <div className={`relative pt-[22px] font-display text-[19px] font-bold`}>
                {c.name}
              </div>
              <div
                className={`${DISPLAY} amount relative text-[58px] leading-[1.05] tracking-[-0.03em]`}
              >
                {c.amount}
              </div>
              <div className="relative text-[15px]">{c.line}</div>
            </div>
          ))}
        </section>

        <section className="border-t-[3px] border-ink">
          <Split
            left={
              <>
                <h2 className={H2}>Four Mondays, four shares.</h2>
                <p className="m-0 max-w-[460px] text-muted">
                  An envelope never hands over the whole month. Food releases $100 on arrival and
                  $100 on each of the next three Mondays, so week four is funded before week one
                  begins.
                </p>
              </>
            }
            right={
              <div className="flex flex-wrap gap-3">
                {TILES.map((tile) => (
                  <div
                    key={tile.date}
                    className={`flex min-h-[210px] min-w-0 flex-[1_1_118px] flex-col justify-between rounded-[14px] ${tile.filled ? "bg-food p-[18px] text-white" : "border-2 border-dashed border-input-border p-4 text-ink"}`}
                  >
                    <div className="text-[15px] font-semibold">{tile.date}</div>
                    <div className="flex flex-col">
                      <div className={`${DISPLAY} text-[32px] leading-[1.1] tracking-[-0.02em]`}>
                        $100
                      </div>
                      <div className={`text-[15px] ${tile.filled ? "" : "text-muted"}`}>
                        {tile.state}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            }
          />
        </section>

        <section className="bg-ink text-white">
          <Split
            left={
              <>
                <h2 className={H2}>The card knows which envelope pays.</h2>
                <p className="m-0 max-w-[440px] text-[#C9D0DE]">
                  You never choose at the till. The kind of shop decides, and if that envelope is
                  short, Everyday pays instead.
                </p>
              </>
            }
            right={SHOPS.map((s, i) => (
              <div
                key={s.shop}
                className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-white/20 py-[18px] ${i === SHOPS.length - 1 ? "border-b" : ""}`}
              >
                <div
                  className={`${DISPLAY} text-[clamp(1.5rem,3.4vw,2.6rem)] leading-[1.1] tracking-[-0.02em]`}
                >
                  {s.shop}
                </div>
                <div className={`rounded-full px-[18px] py-1.5 font-bold ${s.bg}`}>{s.pill}</div>
              </div>
            ))}
          />
        </section>

        <section id="safe" className="relative overflow-hidden bg-emergency text-white">
          <SectionLines className="-top-20 -right-[140px] size-[680px]" />
          <div
            className={`${WRAP} relative flex flex-wrap items-end gap-x-16 gap-y-10 pt-24 pb-[104px]`}
          >
            <div className="flex min-w-0 flex-[1.3_1_420px] flex-col gap-5">
              <h2
                className={`${DISPLAY} text-[clamp(2.4rem,6.4vw,5.5rem)] leading-[0.95] tracking-[-0.035em]`}
              >
                Emergency needs a second yes.
              </h2>
              <p className="m-0 max-w-[520px] text-[20px]">
                The Emergency envelope stays shut until a trusted person approves with a fingerprint
                or face. If they can&apos;t answer, it opens by itself after 48 hours.
              </p>
            </div>
            <p className="sr-only">Example: Raka asks Mama to open $70,00 from Emergency.</p>
            <div
              aria-hidden="true"
              className="flex min-w-0 flex-[0_1_360px] rotate-2 flex-col gap-2.5 rounded-[16px] bg-ground p-[22px] text-ink"
            >
              <div className="text-[15px] font-bold text-emergency">
                Raka asks to open Emergency
              </div>
              <div className={`${DISPLAY} text-[48px] leading-none tracking-[-0.03em]`}>$70,00</div>
              <div className="text-[16px]">
                Laptop broke, needs repair before next week&apos;s exams.
              </div>
              <div className="mt-1.5 flex min-h-[52px] items-center justify-center rounded-full bg-ink text-[16px] font-bold text-white">
                Approve with passkey
              </div>
              <div className="text-[14px] text-muted">Opens by itself on Fri, 9 Oct at 14:05</div>
            </div>
          </div>
        </section>

        <section>
          <Split
            left={
              <>
                <h2 className={H2}>Mama sees totals, not receipts.</h2>
                <p className="m-0 max-w-[460px] text-muted">
                  Parents pay in rupiah by bank transfer and see what is left in each envelope.
                  Where the money was spent stays with the student.
                </p>
                <p className="m-0 max-w-[460px] text-muted">
                  They see an alert in the app when an envelope runs low, a blocked purchase is
                  tried, or Emergency is requested.
                </p>
              </>
            }
            right={TOTALS.map((r, i) => (
              <div
                key={r.name}
                className={`flex items-center justify-between border-t border-[#C9CDC3] py-4 text-[19px] ${i === TOTALS.length - 1 ? "border-b" : ""}`}
              >
                <div className="flex items-center gap-3 font-semibold">
                  <div className={`size-3.5 rounded-[4px] ${r.bg}`} />
                  {r.name}
                </div>
                <div className="amount font-bold">{r.amount}</div>
              </div>
            ))}
          />
        </section>

        <section id="how">
          <div className={`${WRAP} flex flex-col gap-9 pb-24`}>
            <h2 className={`${H2} max-w-[900px]`}>From invite to first allowance in minutes.</h2>
            <div className="flex flex-wrap gap-x-10 gap-y-8">
              {STEPS.map(([title, body], i) => (
                <div
                  key={title}
                  className="flex min-w-0 flex-[1_1_260px] flex-col gap-2 border-t-[3px] border-ink pt-[18px]"
                >
                  <div className={`${DISPLAY} text-[64px] leading-none tracking-[-0.03em]`}>
                    {i + 1}
                  </div>
                  <div className="text-[22px] leading-[1.25] font-bold">{title}</div>
                  <div className="max-w-[320px] text-[17px] text-muted">{body}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq">
          <div className={`${WRAP} flex flex-wrap gap-x-16 gap-y-8 pb-[104px]`}>
            <h2 className={`${H2} min-w-0 flex-[1_1_300px]`}>Questions people ask.</h2>
            <div className="flex min-w-0 flex-[1.6_1_520px] flex-col">
              {QUESTIONS.map(([q, a], i) => (
                <div
                  key={q}
                  className={`flex flex-col gap-1.5 border-t border-[#C9CDC3] py-5 ${i === QUESTIONS.length - 1 ? "border-b" : ""}`}
                >
                  <h3 className="m-0 text-[20px] font-bold">{q}</h3>
                  <p className="m-0 text-[17px] text-muted">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-food text-white">
          <SectionLines className="-top-[330px] -right-[220px] size-[720px]" />
          <div className={`${WRAP} relative flex flex-wrap items-end justify-between gap-10 py-24`}>
            <div className="flex min-w-0 flex-[1_1_480px] flex-col items-start gap-7">
              <h2
                className={`${DISPLAY} text-[clamp(2.6rem,7.4vw,6.5rem)] leading-[0.93] tracking-[-0.04em]`}
              >
                Give the allowance a plan.
              </h2>
              <Link href="/app" className={`${PILL} min-h-[60px] bg-white px-[34px] text-ink`}>
                Open the app
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <Qr url={`${SITE.replace(/\/$/, "")}/app`} />
              <div className="max-w-[150px] text-[17px]">Scan to open on your phone</div>
            </div>
          </div>
        </section>
      </main>

      <footer className={`${WRAP} flex flex-col gap-2.5 pt-7 pb-10 text-[15px] text-muted`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>Amplop is open source under the MIT licence.</div>
          <div className="flex gap-5">
            {DOCS ? (
              <a href={DOCS} className="flex min-h-11 items-center text-link">
                Docs
              </a>
            ) : null}
            {REPO ? (
              <a href={REPO} {...external} className="flex min-h-11 items-center text-link">
                Source code
              </a>
            ) : null}
          </div>
        </div>
        <div>
          Preview version: payments run in test mode and the card is a demo card. Amplop is not a
          bank.
        </div>
      </footer>
    </div>
  );
}
