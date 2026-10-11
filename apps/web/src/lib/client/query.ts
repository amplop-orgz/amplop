// A small read cache: one fetch per key in flight, refetched on focus, on reconnect, after a write
// (here or in another tab), and on an optional interval. Reads time out at 10 s (06 S06-45).
"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Entry = { data?: unknown; error?: unknown; at: number; inflight?: Promise<unknown> };

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();

export function invalidateAll(): void {
  cache.clear();
  for (const l of listeners) l();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error("timeout"));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export type ReadState<T> = {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  refetch: () => void;
};

export function useRead<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: { intervalMs?: number } = {},
): ReadState<T> {
  const [, bump] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const load = useCallback(
    (force: boolean) => {
      if (key === null) return;
      const e = cache.get(key);
      if (e?.inflight || (!force && e && (e.data !== undefined || e.error !== undefined))) return;
      const entry: Entry = e ?? { at: 0 };
      entry.inflight = withTimeout(fetcherRef.current(), 10_000).then(
        (data) => {
          cache.set(key, { data, at: Date.now() });
        },
        (error: unknown) => {
          cache.set(key, { ...(cache.get(key) ?? { at: 0 }), error, inflight: undefined });
        },
      );
      cache.set(key, entry);
      void entry.inflight.then(() => {
        for (const l of listeners) l();
      });
    },
    [key],
  );

  useEffect(() => {
    const onChange = () => {
      bump((n) => n + 1);
      load(false);
    };
    const refresh = () => {
      load(true);
    };
    listeners.add(onChange);
    load(false);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    const timer = opts.intervalMs ? setInterval(refresh, opts.intervalMs) : undefined;
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      if (timer) clearInterval(timer);
    };
  }, [load, opts.intervalMs]);

  const e = key === null ? undefined : cache.get(key);
  return {
    data: e?.data as T | undefined,
    error: e?.error,
    loading: key !== null && e?.data === undefined && e?.error === undefined,
    refetch: () => {
      load(true);
    },
  };
}

/** Other tabs announce confirmed writes on this channel (06 S06-47). */
export function listenForWrites(): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const ch = new BroadcastChannel("amplop");
  ch.onmessage = () => {
    invalidateAll();
  };
  return () => {
    ch.close();
  };
}

export function announceWrite(hash: string): void {
  if (typeof BroadcastChannel === "undefined") return;
  const ch = new BroadcastChannel("amplop");
  ch.postMessage({ type: "tx", hash });
  ch.close();
}
