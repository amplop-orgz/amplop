// Next.js 16 proxy (middleware): a fresh CSP nonce on every document request (05 S05-25).
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, makeNonce } from "@/lib/server/security/csp";

export function proxy(request: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp(nonce, {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_MONAD_RPC_URL: process.env.NEXT_PUBLIC_MONAD_RPC_URL,
    NEXT_PUBLIC_MONAD_RPC_URL_FALLBACK: process.env.NEXT_PUBLIC_MONAD_RPC_URL_FALLBACK,
    NEXT_PUBLIC_INDEXER_URL: process.env.NEXT_PUBLIC_INDEXER_URL,
  });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline.html).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
