// /recover, board 4.2 on the new phone (13 S13-15 to S13-20). The phone cannot know whose account it
// is until the trusted person approves, so the copy says "your trusted person".
"use client";
import { formatDayTime } from "@amplop/shared/dates";
import { PendingKind } from "@amplop/shared/enums";
import { Circle, CircleCheck, CircleDot } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, InfoBox, InlineMessage, Page, showToast, TopBar } from "@/components/ui";
import { createPasskeyAccount, refreshRole, useSession } from "@/lib/client/account";
import { api } from "@/lib/client/api";
import { read } from "@/lib/client/chain/client";
import { ensureFunded, sendUserTx } from "@/lib/client/chain/write";
import { countdownText } from "@/lib/client/emergency";
import { DEMO } from "@/lib/client/env";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import { useRead } from "@/lib/client/query";
import {
  newPhoneState,
  readRecovery,
  writeRecovery,
  type StoredRecovery,
} from "@/lib/client/recovery";
import { copyText, whatsappUrl } from "@/lib/client/share";

type Chain = {
  ownAccount: bigint;
  recoveryAccount: bigint;
  pending?: { active: boolean; readyAt: bigint };
  clock?: bigint;
};

export function Recover() {
  const { t, lang } = useT();
  const router = useRouter();
  const { session } = useSession();
  const [stored, setStored] = useState<StoredRecovery | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const finishing = useRef(false);
  const landed = useRef(false);

  useEffect(() => {
    setStored(readRecovery());
    setLoaded(true);
  }, []);
  const save = (r: StoredRecovery | null) => {
    writeRecovery(r);
    setStored(r);
  };

  const newOwner = stored?.newOwner;
  const fetchChain = useCallback(async (): Promise<Chain> => {
    const [ownAccount, recoveryAccount] = await Promise.all([
      read<bigint>("accountOf", [newOwner]),
      read<bigint>("recoveryAccountOf", [newOwner]),
    ]);
    if (recoveryAccount === 0n) return { ownAccount, recoveryAccount };
    const [p, clock] = await Promise.all([
      read<readonly [boolean, bigint, `0x${string}`]>("pending", [
        recoveryAccount,
        PendingKind.Recovery,
      ]),
      read<bigint>("clock", [recoveryAccount]),
    ]);
    return { ownAccount, recoveryAccount, pending: { active: p[0], readyAt: p[1] }, clock };
  }, [newOwner]);
  const chain = useRead(newOwner ? `recover:${newOwner}` : null, fetchChain, {
    intervalMs: 10_000,
  });
  const c = chain.data;
  const state = newPhoneState({
    stored,
    ownAccount: c?.ownAccount ?? 0n,
    recoveryAccount: c?.recoveryAccount ?? 0n,
    nowMs: Date.now(),
  });

  // S13-19: remember the approval, so a later cancel by the old passkey can be told apart.
  useEffect(() => {
    if (stored && c && c.recoveryAccount !== 0n && !stored.approvedAccountId)
      save({ ...stored, approvedAccountId: c.recoveryAccount.toString() });
  }, [stored, c]);

  // S13-20: finish once the wait is over; land on /app once the account is here.
  useEffect(() => {
    if (state === "done") {
      if (landed.current) return;
      landed.current = true;
      writeRecovery(null);
      void refreshRole().then(() => {
        showToast(t("recover.doneToast"));
        router.replace("/app");
      });
      return;
    }
    if (state !== "approved" || !c?.pending?.active || c.clock === undefined || finishing.current)
      return;
    if (c.clock < c.pending.readyAt) return;
    if (session?.address.toLowerCase() !== newOwner) return;
    finishing.current = true;
    sendUserTx({ functionName: "finishRecovery", args: [c.recoveryAccount] })
      .then(() => {
        chain.refetch();
      })
      .catch(() => {
        finishing.current = false;
        chain.refetch();
      });
  }, [state, c, session, newOwner, router, t, chain]);

  if (!loaded) return null;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await createPasskeyAccount("student", { label: "Amplop (recovered)" });
      const owner = s.address.toLowerCase() as `0x${string}`;
      const [own, trusted] = await Promise.all([
        read<bigint>("accountOf", [owner]),
        read<bigint>("trustedAccountOf", [owner]),
      ]);
      if (own !== 0n || trusted !== 0n) {
        setError(t("recover.hasAccount"));
        return;
      }
      await ensureFunded(owner);
      const r = await api.post<{ linkId: string }>(
        "/api/recovery",
        { newOwner: owner },
        { auth: { action: "recovery.create", accountId: 0n } },
      );
      save({ linkId: r.linkId, newOwner: owner, createdAt: Date.now() });
    } catch (e) {
      setError(t(errorKey(e, hasKey) as Key));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    save(null);
    finishing.current = false;
  };

  if (state === "start") {
    return (
      <>
        <TopBar back="/app" title={t("recover.title")} />
        <Page>
          <p className="m-0">{t("recover.intro")}</p>
          <InfoBox>{t("recover.needsTrusted")}</InfoBox>
          <p className="m-0 text-[0.875rem] text-muted">
            {t("recover.synced")}{" "}
            <Link href="/app" className="font-bold text-link">
              {t("welcome.signIn")}
            </Link>
          </p>
          <div className="flex-1" />
          {error ? <InlineMessage kind="error">{error}</InlineMessage> : null}
          <Button busyLabel={busy ? t("welcome.creating") : null} onClick={() => void start()}>
            {t("recover.create")}
          </Button>
        </Page>
      </>
    );
  }
  if (state === "cancelled" || state === "expired") {
    return (
      <>
        <TopBar back="/app" title={t("recover.title")} />
        <Page>
          <h1 className="m-0 text-[1.375rem] font-bold">
            {t(state === "cancelled" ? "recover.cancelledTitle" : "recover.expired")}
          </h1>
          {state === "cancelled" ? <p className="m-0">{t("recover.cancelledBody")}</p> : null}
          <div className="flex-1" />
          <Button onClick={reset}>{t("recover.startAgain")}</Button>
        </Page>
      </>
    );
  }
  if (!stored) return null;

  const approved = state === "approved";
  const readyAt = c?.pending?.readyAt;
  const link = `${location.origin}/recover/${stored.linkId}`;
  const share = () => {
    const w = window.open(
      whatsappUrl(t("recover.shareText", { link }), { secret: false }),
      "_blank",
    );
    if (w) w.opener = null;
    else
      void copyText(link).then(() => {
        setCopied(true);
      });
    save({ ...stored, shared: true });
  };
  type Step = { s: "done" | "current" | "future"; title: string; sub: string };
  const steps: Step[] = [
    { s: "done", title: t("recover.step1"), sub: formatDayTime(stored.createdAt / 1000, lang) },
    stored.shared
      ? { s: "done", title: t("recover.step2Done"), sub: t("emergency.stepLinkSentSub") }
      : { s: "current", title: t("recover.step2"), sub: "" },
    approved
      ? { s: "done", title: t("recover.step3Done"), sub: "" }
      : { s: "current", title: t("recover.step3"), sub: t("recover.step3Sub") },
    approved && readyAt !== undefined && c?.clock !== undefined
      ? {
          s: "current",
          title: t("recover.step4"),
          sub: t("recover.movesOn", {
            at: formatDayTime(Number(readyAt), lang),
            left: countdownText(t, Number(readyAt - c.clock)),
          }),
        }
      : { s: "future", title: t("recover.step4"), sub: t("recover.step4Sub") },
    { s: "future", title: t("recover.step5"), sub: t("recover.step5Sub") },
  ];
  const Icon = { done: CircleCheck, current: CircleDot, future: Circle };
  return (
    <>
      <TopBar back="/app" title={t("recover.title")} />
      <Page>
        <div className="flex flex-col gap-1 rounded-[16px] border border-border bg-card p-4">
          <div className="font-bold">{t("recover.waitingTitle")}</div>
          <div className="text-[0.875rem] text-muted">{t("recover.waitingBody")}</div>
        </div>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {steps.map((x, i) => {
            const I = Icon[x.s];
            return (
              <li key={i} className="flex items-start gap-3">
                <I
                  size={22}
                  aria-hidden="true"
                  className={`mt-px shrink-0 ${x.s === "done" ? "text-ok" : x.s === "current" ? "text-link" : "text-muted"}`}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="font-bold">{x.title}</span>
                  {x.sub ? <span className="text-[0.875rem] text-muted">{x.sub}</span> : null}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="m-0 text-[0.875rem] text-muted">{t("recover.cardPaused")}</p>
        {approved && DEMO ? <InfoBox>{t("recover.demoHint")}</InfoBox> : null}
        <div className="flex-1" />
        {copied ? <InlineMessage>{t("emergency.linkCopied")}</InlineMessage> : null}
        {approved ? (
          <p className="m-0 text-center text-[0.875rem] text-muted">{t("recover.cancelFromOld")}</p>
        ) : (
          <>
            <Button variant={stored.shared ? "secondary" : "primary"} onClick={share}>
              {stored.shared ? t("emergency.shareAgain") : t("recover.share")}
            </Button>
            <Button variant="danger" onClick={reset}>
              {t("settings.cancelRecovery")}
            </Button>
          </>
        )}
      </Page>
    </>
  );
}
