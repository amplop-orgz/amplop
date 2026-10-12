// Demo controls for Settings and parent home (15 S15-6 to S15-12). Only in a demo build: with
// NEXT_PUBLIC_DEMO_MODE off, DEMO is false at build time and none of this renders.
"use client";
import { formatDay, formatDayTime } from "@amplop/shared/dates";
import { dayOf, daysToNextMonday } from "@amplop/shared/schedule";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, InfoBox, InlineMessage, ProofLink, Sheet } from "@/components/ui";
import { switchProfile, useSession } from "@/lib/client/account";
import { api, ApiError } from "@/lib/client/api";
import { read } from "@/lib/client/chain/client";
import { proofUrl, sendUserTx } from "@/lib/client/chain/write";
import { DEMO } from "@/lib/client/env";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import { listProfiles, type Profile } from "@/lib/client/profiles";
import { invalidateAll, useRead } from "@/lib/client/query";
import type { OrderView } from "@/lib/client/topup";

export type SkipKind = "monday" | "48h";

/** 15 S15-10: whole days, 1 to 7 for the next Monday at the same time of day, 2 for 48 hours. */
export function skipDaysFor(kind: SkipKind, clock: bigint): number {
  return kind === "48h" ? 2 : daysToNextMonday(dayOf(clock));
}

/** 15 S15-11: one job per tap, run one at a time; each reads a fresh clock. A failure drops the rest. */
export function createSkipQueue(
  run: (kind: SkipKind) => Promise<void>,
  onChange: (s: {
    running: SkipKind | null;
    queued: number;
    error: unknown;
    dropped: number;
  }) => void,
) {
  const jobs: SkipKind[] = [];
  let running: SkipKind | null = null;
  const pump = async () => {
    if (running) return;
    const next = jobs.shift();
    if (!next) return;
    running = next;
    onChange({ running, queued: jobs.length, error: null, dropped: 0 });
    try {
      await run(next);
      running = null;
      onChange({ running: null, queued: jobs.length, error: null, dropped: 0 });
      await pump();
    } catch (error) {
      running = null;
      const dropped = jobs.splice(0).length;
      onChange({ running: null, queued: 0, error, dropped });
    }
  };
  return {
    push(kind: SkipKind) {
      jobs.push(kind);
      onChange({ running, queued: jobs.length, error: null, dropped: 0 });
      void pump();
    },
  };
}

function useDemoContract() {
  return useRead(DEMO ? "demoMode" : null, () => read<boolean>("demoMode"));
}

/** The "Skip time" row and its sheet (15 S15-8, S15-9). */
export function SkipTimeRow({ accountId }: { accountId: bigint }) {
  const { t, lang } = useT();
  const demo = useDemoContract();
  const clock = useRead(`clock:${String(accountId)}`, () => read<bigint>("clock", [accountId]));
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{
    running: SkipKind | null;
    queued: number;
    error: unknown;
    dropped: number;
  }>({
    running: null,
    queued: 0,
    error: null,
    dropped: 0,
  });
  const queue = useRef<ReturnType<typeof createSkipQueue> | null>(null);
  useEffect(() => {
    queue.current = createSkipQueue(async (kind) => {
      const fresh = await read<bigint>("clock", [accountId]);
      // sendUserTx refreshes every read (the clock and "Now" included) after the receipt.
      await sendUserTx({ functionName: "skipDays", args: [skipDaysFor(kind, fresh)] });
    }, setState);
  }, [accountId]);
  if (!DEMO || demo.data !== true) return null;
  const now = clock.data;
  const busyLabel = (kind: SkipKind) =>
    state.running === kind
      ? `${t("settings.skipping")}${state.queued ? ` ${t("settings.queued", { n: state.queued })}` : ""}`
      : null;
  return (
    <>
      <div className="flex min-h-[60px] items-center justify-between gap-3 py-2">
        <div className="flex min-w-0 flex-col gap-px">
          <div className="font-bold">{t("settings.skip")}</div>
          <div className="text-[0.8125rem] text-muted">{t("settings.skipSub")}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
          className="flex h-11 shrink-0 items-center text-[0.9375rem] font-bold text-link"
        >
          {t("settings.skipButton")}
        </button>
      </div>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={t("settings.skip")}
      >
        {now !== undefined ? (
          <p className="m-0 text-muted">
            {t("settings.skipNow", { when: formatDayTime(Number(now), lang) })}
          </p>
        ) : null}
        {(["monday", "48h"] as const).map((kind) => (
          <Button
            key={kind}
            variant="secondary"
            busyLabel={busyLabel(kind)}
            disabled={false}
            onClick={() => queue.current?.push(kind)}
            className="flex-col gap-0 py-2"
          >
            <span>{t(kind === "monday" ? "settings.skipMonday" : "settings.skip48")}</span>
            {now !== undefined ? (
              <span className="text-[0.8125rem] font-normal text-muted">
                {kind === "monday"
                  ? formatDay(Number(now) + skipDaysFor("monday", now) * 86400, lang)
                  : formatDayTime(Number(now) + 2 * 86400, lang)}
              </span>
            ) : null}
          </Button>
        ))}
        {state.error ? (
          <InlineMessage kind="error">
            {t(errorKey(state.error, hasKey) as Key)}
            {state.dropped ? ` ${t("settings.skipDropped")}` : ""}
          </InlineMessage>
        ) : null}
        <p className="m-0 text-[0.8125rem] text-muted">{t("settings.skipNote")}</p>
        <Button
          variant="text"
          onClick={() => {
            setOpen(false);
          }}
        >
          {t("settings.close")}
        </Button>
      </Sheet>
    </>
  );
}

function useOtherProfile(): Profile | null {
  const { session } = useSession();
  const [other, setOther] = useState<Profile | null>(null);
  useEffect(() => {
    setOther(listProfiles().find((p) => p.credentialId !== session?.credentialId) ?? null);
  }, [session]);
  return other;
}

/** The "View as" row in Settings (15 S15-6, S15-7). */
export function ViewAsRow({ name }: { name: string }) {
  const { t } = useT();
  const router = useRouter();
  const other = useOtherProfile();
  const [error, setError] = useState<Key | null>(null);
  if (!DEMO) return null;
  return (
    <div className="flex min-h-[60px] items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 flex-col gap-px">
        <div className="user-text font-bold">{t("settings.viewAs", { name })}</div>
        <div className="user-text text-[0.8125rem] text-muted">
          {other ? t("settings.viewAsSub") : t("settings.viewAsHint", { name })}
        </div>
        {error ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}
      </div>
      {other ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            switchProfile(other.credentialId)
              .then(({ home }) => {
                if (home) router.replace(home);
              })
              .catch((e: unknown) => {
                setError(errorKey(e, hasKey) as Key);
              });
          }}
          className="flex h-11 shrink-0 items-center text-[0.9375rem] font-bold text-link"
        >
          {t("settings.switch")}
        </button>
      ) : null}
    </div>
  );
}

/** "Demo only: view as Raka" under parent home's actions, or "View as Mama" on the approval page (15 S15-6). */
export function ViewAsLink({ name, onApproval = false }: { name: string; onApproval?: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const other = useOtherProfile();
  const [error, setError] = useState<Key | null>(null);
  if (!DEMO || !other) return null;
  return (
    <>
      <Button
        variant={onApproval ? "secondary" : "text"}
        parent
        onClick={() => {
          setError(null);
          switchProfile(other.credentialId, { stay: onApproval })
            .then(({ home }) => {
              if (home) router.replace(home);
              else router.refresh();
            })
            .catch((e: unknown) => {
              setError(errorKey(e, hasKey) as Key);
            });
        }}
      >
        <span className="user-text">
          {onApproval ? t("settings.viewAs", { name }) : t("parent.viewAs", { name })}
        </span>
      </Button>
      {error ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}
    </>
  );
}

/** Board 1.3's test-mode box (15 S15-5). Double taps deposit once on the server (08 C6). */
export function SimulatePaymentButton({
  orderId,
  accountId,
  onDone,
}: {
  orderId: string;
  accountId: bigint;
  onDone: (o: OrderView) => void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!DEMO) return <InfoBox>{t("order.testModeOnly")}</InfoBox>;
  const simulate = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    api
      .post<OrderView>(
        `/api/topup/${orderId}/simulate`,
        {},
        { auth: { action: "topup.simulate", accountId } },
      )
      .then(onDone)
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : t("error.generic"));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <div className="flex flex-col gap-2">
      <InfoBox>{t("order.testMode")}</InfoBox>
      <Button
        parent
        variant="secondary"
        busyLabel={busy ? t("order.simulating") : null}
        onClick={simulate}
      >
        {t("order.simulate")}
      </Button>
      {error ? (
        <InlineMessage kind="error" onRetry={simulate}>
          {error}
        </InlineMessage>
      ) : null}
    </div>
  );
}

/** "Demo only: collect now" on boards 2.6 and 2.10 (15 S15-13), for a held purchase in its hold period. */
export function CollectNowButton({
  purchaseId,
  accountId,
  show,
  className = "",
}: {
  purchaseId: string;
  accountId: bigint;
  show: boolean;
  className?: string;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!DEMO || (!show && !tx)) return null;
  const collect = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    api
      .post<{ state: string; txHash: string }>(
        "/api/card/collect",
        { purchaseId },
        { auth: { action: "card.collect", accountId } },
      )
      .then((r) => {
        setTx(r.txHash);
        invalidateAll();
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : t("error.generic"));
        invalidateAll();
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <>
      {show ? (
        <Button
          variant="text"
          className={`text-[0.875rem] ${className}`}
          busyLabel={busy ? t("result.collecting") : null}
          onClick={collect}
        >
          {t("result.collectNow")}
        </Button>
      ) : null}
      {error ? <InlineMessage kind="error">{error}</InlineMessage> : null}
      {tx ? <ProofLink href={proofUrl(tx)} what={t("result.collected")} /> : null}
    </>
  );
}
