import type { NextConfig } from "next";

// Static security headers on every response (05 S05-24). The CSP is per request, in src/proxy.ts.
export const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value:
      "publickey-credentials-create=(self), publickey-credentials-get=(self), camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), display-capture=(), accelerometer=(), gyroscope=(), magnetometer=(), browsing-topics=()",
  },
];

// 17 S17-9, edge cases: public link addresses never carry a banned word, and a production deploy needs the
// docs and source links (a missing one is hidden on other builds).
const LINKS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_DOCS_URL",
  "NEXT_PUBLIC_REPO_URL",
  "NEXT_PUBLIC_DEMO_VIDEO_URL",
];
for (const name of LINKS) {
  if (/crypto|blockchain|hackathon|monad/i.test(process.env[name] ?? ""))
    throw new Error(`${name} contains a word the landing page may not show (17 S17-9).`);
}
if (process.env.VERCEL_ENV === "production") {
  for (const name of ["NEXT_PUBLIC_DOCS_URL", "NEXT_PUBLIC_REPO_URL"])
    if (!process.env[name]) throw new Error(`${name} must be set for a production build (17).`);
}

const config: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  headers: () => Promise.resolve([{ source: "/:path*", headers: SECURITY_HEADERS }]),
};

export default config;
