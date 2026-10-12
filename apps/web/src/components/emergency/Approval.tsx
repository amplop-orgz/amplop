// /approve/[linkId]: boards 3.3 Approval and 3.4 Emergency opened, and the other link states
// (12 S12-17 to S12-22). There is no refuse button (R17); the contract checks who approves.
"use client";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { formatDayTime } from "@amplop/shared/dates";
import { formatRupiah, formatUsd } from "@amplop/shared/money";
import { shortName } from "@amplop/shared/names";
import { Check, Fingerprint, Lock } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { parseEventLogs, type Hash } from "viem";
import { ViewAsLink } from "@/components/demo/DemoControls";
import { Button, ButtonLink, InfoBox, InlineMessage, ProofLink } from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { api, ApiError } from "@/lib/client/api";
import { ChainError, proofUrl, sendUserTx } from "@/lib/client/chain/write";
import { useProfileName, useTrustedName } from "@/lib/client/data";
import { approvalState, clockNow, useEmergency, type ApprovalState } from "@/lib/client/emergency";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import { useRead } from "@/lib/client/query";
import { whatsappUrl } from "@/lib/client/share";
import { rupiahOf } from "@/lib/client/topup";
import { useTxLabel } from "./EmergencyScreen";

type Link = { accountId: bigint; requestSeq: bigint; reason: string };
type Done = { hash: Hash; ms: number; amount: bigint };

export function Approval() {
  const { t, lang } = useT();
  const txLabel = useTxLabel();
  const linkId = useParams<{ linkId: string }>().linkId;
  const { session, role } = useSession();
  const signer =
    typeof role === "object" ? (role.trustedAccountId ?? role.studentAccountId) : undefined;
  const fetchLink = useCallback(async (): Promise<Link | "notForYou" | "invalid"> => {
    if (signer === undefined) return "notForYou";
    try {
      const r = await api.get<{ accountId: string; requestSeq: string; reason: string }>(
        `/api/reason/${linkId}`,
        { auth: { action: "reason.read", accountId: signer } },
      );
      return { accountId: BigInt(r.accountId), requestSeq: BigInt(r.requestSeq), reason: r.reason };
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) return "notForYou";
      if (e instanceof ApiError && e.status === 404) return "invalid";
      throw e;
    }
  }, [linkId, signer]);
  const link = useRead(
    session && typeof role === "object" ? `approve:${session.address}:${linkId}` : null,
    fetchLink,
  );
  const l = typeof link.data === "object" ? link.data : null;
  const em = useEmergency(l?.accountId);
  const studentName = useProfileName(l?.accountId);
  const trustedName = useTrustedName(l?.accountId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  if (typeof role !== "object") return null;
  if (link.error || em.error) {
    return (
      <div className="p-5">
        <InlineMessage
          kind="offline"
          onRetry={() => {
            link.refetch();
            em.refetch();
          }}
        >
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  if (link.data === "invalid")
    return <Message title={t("approve.kicker")} body={t("approve.invalid")} />;
  if (link.data === "notForYou")
    return <Message title={t("approve.notForYou")} body={t("approve.notForYouBody")} />;
  const d = em.data;
  if (!l || !d || studentName.loading)
    return <div className="p-5 text-muted">{t("common.loading")}</div>;

  const me = session?.address.toLowerCase();
  const isTrusted = d.info.trusted.toLowerCase() === me;
  const isOwner = d.info.owner.toLowerCase() === me;
  const state: ApprovalState = approvalState({
    isTrusted,
    isOwner,
    em: d.em,
    linkSeq: l.requestSeq,
    clock: clockNow(d),
    approvedHere: done !== null,
  });
  const name = studentName.data ? shortName(studentName.data) : t("common.theStudent");
  const usd = (u: bigint) => formatUsd(u, d.decimals);
  const amount = usd(d.em.amount);
  const home = { href: "/app/parent", label: t("order.backHome") };

  const approve = async () => {
    if (busy) return;
    setError(null);
    const started = Date.now();
    try {
      const r = await sendUserTx(
        { functionName: "approveEmergency", args: [l.accountId, l.requestSeq] },
        {
          onStatus: (s) => {
            setBusy(txLabel(s));
          },
        },
      );
      const ev = parseEventLogs({
        abi: amplopEnvelopesAbi,
        logs: r.receipt.logs,
        eventName: "EmergencyOpened",
      })[0];
      setDone({ hash: r.hash, ms: Date.now() - started, amount: ev?.args.amount ?? d.em.amount });
    } catch (e) {
      em.refetch();
      // A revert re-reads the contract; the state picker then shows "Already opened" or "Not for you".
      if (!(
        e instanceof ChainError &&
        ["NoOpenRequest", "NotTrusted", "RequestChanged"].includes(e.errorName)
      ))
        setError(errorKey(e, hasKey) as Key);
    } finally {
      setBusy(null);
    }
  };

  switch (state) {
    case "notForYou":
      return <Message title={t("approve.notForYou")} body={t("approve.notForYouBody")} />;
    case "openedByTime":
      return (
        <Message
          title={t("approve.alreadyOpened")}
          body={t("approve.byTime", { amount, name })}
          action={home}
        />
      );
    case "alreadyOpened":
      return (
        <Message
          title={t("approve.alreadyOpened")}
          body={t("approve.alreadyBody", { amount, name })}
          action={home}
        />
      );
    case "cancelled":
      return (
        <Message
          title={t("approve.cancelled")}
          body={t("approve.cancelledBody", { name })}
          action={home}
        />
      );
    case "closed":
      return (
        <Message
          title={t("approve.closed")}
          body={t("approve.closedBody", { name })}
          action={home}
        />
      );
    case "done": {
      if (!done) break;
      const opened = done;
      return (
        <div className="flex min-h-dvh flex-1 flex-col gap-5 px-5 pt-12 pb-6">
          <div className="flex flex-col items-center gap-2.5 text-center">
            <div className="flex size-[72px] items-center justify-center rounded-full bg-ok-bg text-ok">
              <Check size={34} aria-hidden="true" />
            </div>
            <h1 className="m-0 text-[1.5rem] font-bold text-ok">{t("approve.doneTitle")}</h1>
            <p className="user-text amount m-0">
              {t("approve.doneLine", { amount: usd(opened.amount), name })}
            </p>
          </div>
          <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border">
            <Row label={t("approve.opened")}>{usd(opened.amount)}</Row>
            <Row label={t("emergency.stillLocked")}>
              <span className="flex items-center gap-1.5">
                <Lock size={16} aria-hidden="true" />
                {usd(d.locked)}
              </span>
            </Row>
            <Row label={t("approve.approvedBy")}>{t("approve.you")}</Row>
          </div>
          <div className="flex flex-col gap-2 rounded-[16px] bg-quiet px-4 pt-3.5 pb-1">
            <div className="text-[0.875rem] font-bold text-muted">{t("result.detail")}</div>
            <div className="flex justify-between text-[0.875rem]">
              <span className="text-muted">{t("result.value")}</span>
              <span className="amount">{usd(opened.amount).slice(1)} AUSD</span>
            </div>
            {opened.ms > 0 ? (
              <div className="flex justify-between text-[0.875rem]">
                <span className="text-muted">{t("result.confirmedIn")}</span>
                <span className="amount">
                  {t("result.seconds", { n: (opened.ms / 1000).toFixed(1).replace(".", ",") })}
                </span>
              </div>
            ) : null}
            <ProofLink href={proofUrl(opened.hash)} what={t("approve.doneTitle")} />
          </div>
          <div className="flex-1" />
          <ButtonLink parent href="/app/parent">
            {t("order.backHome")}
          </ButtonLink>
        </div>
      );
    }
    default:
      break;
  }

  // 3.3, or the owner's read-only copy of it (S12-17 step 5).
  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-8 pb-6">
      <div className="text-[0.875rem] font-bold text-muted uppercase">{t("approve.kicker")}</div>
      <h1 className="user-text m-0 text-[1.5rem] leading-tight font-bold">
        {t("approve.heading", { name })}
      </h1>
      <div className="flex flex-col gap-1 rounded-[16px] border border-border bg-card px-4 py-4">
        <span className="text-[0.875rem] text-muted">{t("approve.amountRequested")}</span>
        <span className="amount text-[2rem] leading-tight font-bold" data-testid="approve-amount">
          {amount}
        </span>
        <span className="amount text-[0.875rem] text-muted">
          {t("approve.of", {
            locked: usd(d.locked),
            rupiah: formatRupiah(rupiahOf(d.em.amount, d.decimals)),
          })}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="user-text text-[0.875rem] font-bold">
          {t("approve.reasonOf", { name })}
        </span>
        <p className="user-text m-0 whitespace-pre-wrap" data-testid="approve-reason">
          {l.reason}
        </p>
        <span className="text-[0.875rem] text-muted">
          {t("approve.sent", { at: formatDayTime(Number(d.em.requestedAt), lang) })}
        </span>
      </div>
      <InfoBox icon="clock">
        {t("approve.info", { opensAt: formatDayTime(Number(d.em.opensAt), lang) })}
      </InfoBox>
      <div className="flex-1" />
      {state === "ownerView" ? (
        <>
          <InfoBox>
            {t("approve.ownerOnly", { trusted: trustedName ?? t("common.yourTrustedPerson") })}
          </InfoBox>
          <ViewAsLink name={trustedName ?? t("common.yourTrustedPerson")} onApproval />
        </>
      ) : (
        <>
          {error ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}
          <Button parent busyLabel={busy} onClick={() => void approve()}>
            <Fingerprint size={20} aria-hidden="true" />
            {t("approve.approve")}
          </Button>
          <p className="m-0 text-center text-[0.875rem] text-muted">{t("approve.helper")}</p>
          <Button
            variant="text"
            parent
            onClick={() => {
              const w = window.open(
                whatsappUrl(t("approve.messageText", { name }), { secret: false }),
                "_blank",
              );
              if (w) w.opener = null;
            }}
          >
            <span className="user-text">{t("approve.messageFirst", { name })}</span>
          </Button>
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="amount font-bold">{children}</span>
    </div>
  );
}

function Message({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-12 pb-6">
      <h1 className="m-0 text-[1.5rem] font-bold">{title}</h1>
      <p className="user-text m-0">{body}</p>
      <div className="flex-1" />
      {action ? (
        <ButtonLink parent href={action.href}>
          {action.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}
