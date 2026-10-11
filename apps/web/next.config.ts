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

const config: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  headers: () => Promise.resolve([{ source: "/:path*", headers: SECURITY_HEADERS }]),
};

export default config;
