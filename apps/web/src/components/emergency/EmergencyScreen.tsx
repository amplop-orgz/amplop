// /app/emergency: boards 3.1 Ask, 3.2 Waiting, 3.5 No trusted person and the notices (12 S12-1 to
// S12-11). The request is a transaction first; the reason text is saved after, with retries.
"use client";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { formatDayTime } from "@amplop/shared/dates";
import { formatUsd } from "@amplop/shared/money";
import { Check, Circle, CircleDot, CircleCheck, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { keccak256, parseEventLogs, toBytes } from "viem";
import {
  Button,
  ButtonLink,
  InfoBox,
  InlineMessage,
  Page,
  ProofLink,
  Sheet,
  showToast,
  TopBar,
} from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { api, ApiError } from "@/lib/client/api";
import { proofUrl, sendUserTx, type TxStatus } from "@/lib/client/chain/write";
import { useTrustedName } from "@/lib/client/data";
import {
  approvalLink,
  canSend,
  clockNow,
  countdownParts,
  hasTrustedPerson,
  mark,
  marks,
  parseRequestAmount,
  reasonLength,
  studentScreen,
  useEmergency,
  type EmergencyData,
} from "@/lib/client/emergency";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import { copyText, whatsappUrl } from "@/lib/client/share";
import { finalizeTx } from "./AutoFinish";

type Saved = { linkId: string; requestSeq: bigint; reason: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** S12-6 step 5: the server's node may not have the block yet, so 409 request_not_found and 502 retry. */
async function saveReason(accountId: bigint, requestSeq: bigint, reason: string): Promise<string> {
  for (let i = 0; ; i++) {
    try {
      const r = await api.post<{ linkId: string }>(
        "/api/reason",
        { accountId: accountId.toString(), requestSeq: requestSeq.toString(), reason },
        { auth: { action: "reason.save", accountId } },
      );
      return r.linkId;
    } catch (e) {
      const retry = e instanceof ApiError && (e.code === "request_not_found" || e.status === 502);
      if (!retry || i >= 4) throw e;
      await sleep(2_000);
    }
  }
}

export function useTxLabel() {
  const { t } = useT();
  return (s: TxStatus): string =>
    t(s === "funding" || s === "confirming" || s === "slow" ? `tx.${s}` : "tx.sending");
}

export function EmergencyScreen() {
  const { t } = useT();
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const data = useEmergency(accountId);
  const trustedName = useTrustedName(accountId);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [, rerender] = useState(0);

  // S12-7: another device, a reload or a recovered account gets the link from /current.
  const seq = data.data?.em.requestSeq;
  const fetchCurrent = useCallback(async () => {
    if (accountId === undefined) return;
    try {
      const r = await api.get<{ linkId: string; requestSeq: string; reason: string }>(
        "/api/reason/current",
        { auth: { action: "reason.current", accountId } },
      );
      setSaved({ linkId: r.linkId, requestSeq: BigInt(r.requestSeq), reason: r.reason });
    } catch {
      // No saved reason: the WhatsApp buttons stay hidden and the reason line is left out.
    }
  }, [accountId]);
  useEffect(() => {
    if (seq !== undefined && seq > 0n && saved?.requestSeq !== seq) void fetchCurrent();
  }, [seq, saved?.requestSeq, fetchCurrent]);

  if (accountId === undefined) return null;
  if (data.error) {
    return (
      <div className="p-5">
        <InlineMessage kind="offline" onRetry={data.refetch}>
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  const d = data.data;
  if (!d) return <div className="p-5 text-muted">{t("common.loading")}</div>;
  const name = trustedName ?? t("common.yourTrustedPerson");
  const screen = studentScreen(d, marks(accountId).seenSeq);

  const notice = (text: string, action: { href: string; label: string }) => (
    <>
      <TopBar back="/app" title={t("emergency.title")} />
      <Page>
        <InfoBox>{text}</InfoBox>
        <div className="flex-1" />
        <ButtonLink href={action.href}>{action.label}</ButtonLink>
      </Page>
    </>
  );
  switch (screen) {
    case "lockOff":
      return notice(t("emergency.lockIsOff"), { href: "/app", label: t("emergency.back") });
    case "lockOffPending":
      return notice(t("emergency.lockOffPending"), {
        href: "/app/settings",
        label: t("emergency.goSettings"),
      });
    case "empty":
      return notice(t("emergency.empty"), { href: "/app", label: t("emergency.back") });
    case "opened":
      return (
        <Opened
          d={d}
          accountId={accountId}
          onSeen={() => {
            rerender((n) => n + 1);
          }}
        />
      );
    case "waiting":
      return (
        <Waiting
          d={d}
          accountId={accountId}
          name={name}
          trusted={hasTrustedPerson(d.info)}
          saved={saved?.requestSeq === d.em.requestSeq ? saved : null}
          onSaved={setSaved}
          onCancelled={data.refetch}
        />
      );
    default:
      return (
        <Form
          d={d}
          accountId={accountId}
          name={name}
          trusted={hasTrustedPerson(d.info)}
          onRequested={(s) => {
            setSaved(s);
            data.refetch();
          }}
        />
      );
  }
}

function Form({
  d,
  accountId,
  name,
  trusted,
  onRequested,
}: {
  d: EmergencyData;
  accountId: bigint;
  name: string;
  trusted: boolean;
  onRequested: (s: Saved) => void;
}) {
  const { t } = useT();
  const txLabel = useTxLabel();
  const amountId = useId();
  const reasonId = useId();
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const usd = (u: bigint) => formatUsd(u, d.decimals);
  const amount = parseRequestAmount(amountText, d.decimals);
  const amountOk = amount !== null && amount > 0n && amount <= d.locked;
  const n = reasonLength(reason);

  const send = async () => {
    if (amount === null) return;
    setError(null);
    const text = reason.trim();
    let requestSeq: bigint;
    try {
      const r = await sendUserTx(
        { functionName: "requestEmergency", args: [amount, keccak256(toBytes(text))] },
        {
          onStatus: (s) => {
            setBusy(txLabel(s));
          },
        },
      );
      const ev = parseEventLogs({
        abi: amplopEnvelopesAbi,
        logs: r.receipt.logs,
        eventName: "EmergencyRequested",
      })[0];
      requestSeq = ev?.args.requestSeq ?? 0n;
    } catch (e) {
      setBusy(null);
      setError(errorKey(e, hasKey) as Key);
      return;
    }
    let linkId = "";
    try {
      linkId = await saveReason(accountId, requestSeq, text);
    } catch {
      // The request stands; 3.2 offers to save the reason again.
    }
    setBusy(null);
    onRequested({ linkId, requestSeq, reason: text });
  };

  return (
    <>
      <TopBar back="/app" title={t("emergency.askTitle")} />
      <Page>
        <div className="flex items-center justify-between rounded-[16px] bg-emergency px-4 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <Lock size={20} aria-hidden="true" />
            <div className="flex flex-col">
              <span className="font-bold">{t("envelope.4")}</span>
              <span className="text-[0.8125rem] opacity-90">{t("emergency.locked")}</span>
            </div>
          </div>
          <span className="amount text-[1.25rem] font-bold" data-testid="emergency-locked">
            {usd(d.locked)}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={amountId} className="text-[0.875rem] font-bold">
            {t("emergency.amount")}
          </label>
          <input
            id={amountId}
            inputMode="decimal"
            autoComplete="off"
            placeholder="$0,00"
            value={amountText}
            onChange={(e) => {
              setAmountText(e.target.value);
            }}
            className="amount h-14 w-full rounded-[12px] border border-input-border bg-card px-4 text-[1.125rem] font-semibold text-ink"
          />
          {amountOk ? (
            <div aria-live="polite" className="amount text-[0.875rem] text-muted">
              {t("emergency.rest", { amount: usd(d.locked - amount) })}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={reasonId} className="text-[0.875rem] font-bold">
            {t("emergency.reason")}
          </label>
          <textarea
            id={reasonId}
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
            }}
            className="user-text w-full rounded-[12px] border border-input-border bg-card px-4 py-3 text-[1rem] text-ink"
          />
          <div className="flex justify-between gap-3 text-[0.8125rem]">
            <span className="user-text text-muted">
              {trusted ? t("emergency.willRead", { name }) : t("emergency.ownRecord")}
            </span>
            <span className={`amount shrink-0 ${n > 280 ? "font-bold text-danger" : "text-muted"}`}>
              {n}/280
            </span>
          </div>
        </div>
        <InfoBox icon="clock">
          {trusted ? t("emergency.infoTrusted", { name }) : t("emergency.infoAlone")}
        </InfoBox>
        <div className="flex-1" />
        {error ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}
        <Button
          disabled={!canSend(amount, d.locked, reason) || busy !== null}
          busyLabel={busy}
          onClick={() => void send()}
        >
          <span className="user-text">
            {trusted ? t("emergency.send", { name }) : t("emergency.startWait")}
          </span>
        </Button>
        {trusted ? null : (
          <ButtonLink variant="text" href="/app/invite">
            {t("emergency.inviteInstead")}
          </ButtonLink>
        )}
      </Page>
    </>
  );
}

function useStudentClock(d: EmergencyData): bigint {
  const [now, setNow] = useState(() => clockNow(d));
  useEffect(() => {
    setNow(clockNow(d));
    const timer = setInterval(() => {
      setNow(clockNow(d));
    }, 1_000);
    return () => {
      clearInterval(timer);
    };
  }, [d]);
  return now;
}

function Waiting({
  d,
  accountId,
  name,
  trusted,
  saved,
  onSaved,
  onCancelled,
}: {
  d: EmergencyData;
  accountId: bigint;
  name: string;
  trusted: boolean;
  saved: Saved | null;
  onSaved: (s: Saved) => void;
  onCancelled: () => void;
}) {
  const { t, lang } = useT();
  const [shared, setShared] = useState(() => marks(accountId).sharedSeq === d.em.requestSeq);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const now = useStudentClock(d);
  const left = Number(d.em.opensAt - now);
  const cd = countdownParts(left);
  const countdown =
    left <= 0 || !cd
      ? t("emergency.lessThanMinute")
      : cd.h > 0
        ? t("emergency.hoursMinutes", { h: cd.h, m: cd.m })
        : t("emergency.minutes", { m: cd.m });
  const amount = formatUsd(d.em.amount, d.decimals);
  const opensAt = formatDayTime(Number(d.em.opensAt), lang);
  const linkReady = Boolean(saved?.linkId);

  const share = () => {
    if (!saved?.linkId) return;
    const link = approvalLink(location.origin, saved.linkId);
    const w = window.open(
      whatsappUrl(t("emergency.shareText", { name, link }), { secret: false }),
      "_blank",
    );
    if (w) w.opener = null;
    else
      void copyText(link).then(() => {
        setCopied(true);
      });
    mark(accountId, "sharedSeq", d.em.requestSeq);
    setShared(true);
  };

  const cancel = () => {
    setBusy(t("emergency.cancelling"));
    setError(null);
    sendUserTx({ functionName: "cancelEmergency", args: [] }).then(
      () => {
        setBusy(null);
        setSheet(false);
        showToast(t("emergency.cancelledToast"));
        onCancelled();
      },
      (e: unknown) => {
        setBusy(null);
        setError(errorKey(e, hasKey) as Key);
      },
    );
  };

  type Step = { state: "done" | "current" | "future"; title: string; sub: string };
  const steps: Step[] = trusted
    ? [
        {
          state: "done",
          title: t("emergency.stepSent"),
          sub: formatDayTime(Number(d.em.requestedAt), lang),
        },
        shared
          ? {
              state: "done",
              title: t("emergency.stepLinkSent", { name }),
              sub: t("emergency.stepLinkSentSub"),
            }
          : {
              state: "current",
              title: t("emergency.stepSendLink", { name }),
              sub: t("emergency.stepSendLinkSub"),
            },
        {
          state: "current",
          title: t("emergency.stepApproval", { name }),
          sub: t("emergency.stepApprovalSub", { name }),
        },
        { state: "future", title: t("emergency.stepMoves", { amount }), sub: saved?.reason ?? "" },
      ]
    : [
        {
          state: "done",
          title: t("emergency.stepSent"),
          sub: formatDayTime(Number(d.em.requestedAt), lang),
        },
        {
          state: "current",
          title: t("emergency.stepWait"),
          sub: t("emergency.stepWaitSub", { opensAt }),
        },
        { state: "future", title: t("emergency.stepMoves", { amount }), sub: saved?.reason ?? "" },
      ];
  const Icon = { done: CircleCheck, current: CircleDot, future: Circle };

  return (
    <>
      <TopBar back="/app" title={t("emergency.requestTitle")} />
      <Page>
        <div className="flex flex-col gap-1 rounded-[16px] border border-border bg-card px-4 py-4">
          <div className="user-text font-bold">
            {trusted ? t("emergency.waitingFor", { name }) : t("emergency.waiting")}
          </div>
          <div className="text-[0.875rem] text-muted">
            {trusted ? t("emergency.orOpensIn") : t("emergency.opensIn")}
          </div>
          <div
            className="amount text-[2rem] leading-tight font-bold"
            data-testid="emergency-countdown"
          >
            {countdown}
          </div>
          <div className="text-[0.875rem] text-muted">{opensAt}</div>
        </div>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {steps.map((s, i) => {
            const I = Icon[s.state];
            return (
              <li key={i} className="flex items-start gap-3">
                <I
                  size={22}
                  aria-hidden="true"
                  className={`mt-px shrink-0 ${s.state === "done" ? "text-ok" : s.state === "current" ? "text-link" : "text-muted"}`}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="user-text amount font-bold">{s.title}</span>
                  {s.sub ? (
                    <span className="user-text text-[0.875rem] text-muted">{s.sub}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        {saved && !saved.linkId ? (
          <InlineMessage
            kind="error"
            onRetry={() => {
              setRetrying(true);
              saveReason(accountId, saved.requestSeq, saved.reason)
                .then((linkId) => {
                  onSaved({ ...saved, linkId });
                })
                .catch(() => undefined)
                .finally(() => {
                  setRetrying(false);
                });
            }}
          >
            {retrying ? t("common.loading") : t("emergency.reasonNotSaved")}
          </InlineMessage>
        ) : null}
        <div className="flex-1" />
        {copied ? (
          <InlineMessage>
            <Check size={16} aria-hidden="true" className="inline" /> {t("emergency.linkCopied")}
          </InlineMessage>
        ) : null}
        {error ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}
        {trusted && linkReady ? (
          <Button variant={shared ? "secondary" : "primary"} onClick={share}>
            <span className="user-text">
              {shared ? t("emergency.shareAgain") : t("emergency.share", { name })}
            </span>
          </Button>
        ) : null}
        <Button
          variant="danger"
          onClick={() => {
            setSheet(true);
          }}
        >
          {t("emergency.cancel")}
        </Button>
      </Page>
      <Sheet
        open={sheet}
        onClose={() => {
          setSheet(false);
        }}
        title={t("emergency.cancelTitle")}
      >
        <p className="user-text m-0">
          {trusted ? t("emergency.cancelBody", { name }) : t("emergency.cancelBodyAlone")}
        </p>
        <Button variant="danger" busyLabel={busy} onClick={cancel}>
          {t("emergency.cancel")}
        </Button>
        <Button
          variant="secondary"
          disabled={busy !== null}
          onClick={() => {
            setSheet(false);
          }}
        >
          {t("emergency.keepWaiting")}
        </Button>
      </Sheet>
    </>
  );
}

function Opened({
  d,
  accountId,
  onSeen,
}: {
  d: EmergencyData;
  accountId: bigint;
  onSeen: () => void;
}) {
  const { t } = useT();
  const router = useRouter();
  const hash = finalizeTx.get(`${accountId.toString()}:${d.em.requestSeq.toString()}`);
  const seen = () => {
    mark(accountId, "seenSeq", d.em.requestSeq);
  };
  return (
    <div className="flex min-h-dvh flex-1 flex-col gap-5 px-5 pt-12 pb-6">
      <div className="flex flex-col items-center gap-2.5 text-center">
        <div className="flex size-[72px] items-center justify-center rounded-full bg-ok-bg text-ok">
          <Check size={34} aria-hidden="true" />
        </div>
        <h1 className="m-0 text-[1.5rem] font-bold text-ok">{t("emergency.opened")}</h1>
        <p className="amount m-0">
          {t("emergency.openedLine", { amount: formatUsd(d.em.amount, d.decimals) })}
        </p>
      </div>
      <div className="flex min-h-14 items-center justify-between rounded-[16px] border border-border bg-card px-4">
        <span className="text-muted">{t("emergency.stillLocked")}</span>
        <span className="amount font-bold">{formatUsd(d.locked, d.decimals)}</span>
      </div>
      {hash ? <ProofLink href={proofUrl(hash)} what={t("emergency.opened")} /> : null}
      <div className="flex-1" />
      <Button
        onClick={() => {
          seen();
          router.push("/app");
        }}
      >
        {t("emergency.back")}
      </Button>
      {d.locked > 0n ? (
        <Button
          variant="text"
          onClick={() => {
            seen();
            onSeen();
          }}
        >
          {t("emergency.askAgain")}
        </Button>
      ) : null}
    </div>
  );
}
