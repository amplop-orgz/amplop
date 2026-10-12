// Content-Security-Policy with a per-request nonce (05 S05-25). No `server-only` import: proxy.ts runs
// outside the React server layer, and this file holds no secret.

/** Origins Mera calls, if the day-one check finds any (S05-25). */
export const MERA_CONNECT_ORIGINS: readonly string[] = [];

type CspEnv = {
  NODE_ENV?: string;
  /** Plain http on localhost (local runs and the e2e harness): no upgrade-insecure-requests, which
   *  WebKit would apply to the page's own scripts and styles. */
  localHttp?: boolean;
  NEXT_PUBLIC_MONAD_RPC_URL?: string;
  NEXT_PUBLIC_MONAD_RPC_URL_FALLBACK?: string;
  NEXT_PUBLIC_INDEXER_URL?: string;
};

function origin(u: string | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

export function buildCsp(nonce: string, e: CspEnv): string {
  const connect = [
    "'self'",
    origin(e.NEXT_PUBLIC_MONAD_RPC_URL),
    origin(e.NEXT_PUBLIC_MONAD_RPC_URL_FALLBACK),
    origin(e.NEXT_PUBLIC_INDEXER_URL),
    ...MERA_CONNECT_ORIGINS,
  ].filter((v, i, a): v is string => v !== null && a.indexOf(v) === i);
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(e.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
  ];
  return [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    `style-src-elem 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    ...(e.localHttp ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function makeNonce(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b));
}
