// /recover/[linkId], board 4.3 for the trusted person (13 S13-27 to S13-30). The contract decides who
// may approve; this page only shows the request and its state.
"use client";
import { formatDayTime } from "@amplop/shared/dates";
import { PendingKind } from "@amplop/shared/enums";
import { shortName } from "@amplop/shared/names";
import { Fingerprint, TriangleAlert } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Button, ButtonLink, InlineMessage, ProofLink } from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { api, ApiError } from "@/lib/client/api";
import { read } from "@/lib/client/chain/client";
import { proofUrl, sendUserTx, type TxStatus } from "@/lib/client/chain/write";
import { useProfileName } from "@/lib/client/data";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import { useRead } from "@/lib/client/query";
import { approvalPageState } from "@/lib/client/recovery";
import { whatsappUrl } from "@/lib/client/share";

type Link = { newOwner: `0x${string}`; createdAt: string; dismissed: boolean };
type PendingTuple = readonly [boolean, bigint, `0x${string}`];

export function RecoverApproval() {
  const { t, lang } = useT();
  const linkId = useParams<{ linkId: string }>().linkId;
  const { session, role } = useSession();
  const accountId = typeof role === "object" ? role.trustedAccountId : undefined;
  const fetchLink = useCallback(async (): Promise<Link | "notForYou" | "invalid"> => {
    try {
      return await api.get<Link>(`/api/recovery/${linkId}`, {
        auth: { action: "recovery.read", accountId },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) return "notForYou";
      if (e instanceof ApiError && e.status === 404) return "invalid";
      throw e;
    }
  }, [linkId, accountId]);
  const link = useRead(
    session && accountId !== undefined ? `recover-link:${session.address}:${linkId}` : null,
    fetchLink,
  );
  const l = typeof link.data === "object" ? link.data : null;
  const fetchChain = useCallback(async () => {
    const id = accountId ?? 0n;
    const owner = l?.newOwner;
    const [recovery, removal, clock, ownAccount, trustedOf, recoveryAccount] = await Promise.all([
      read<PendingTuple>("pending", [id, PendingKind.Recovery]),
      read<PendingTuple>("pending", [id, PendingKind.TrustedRemoval]),
      read<bigint>("clock", [id]),
      read<bigint>("accountOf", [owner]),
      read<bigint>("trustedAccountOf", [owner]),
      read<bigint>("recoveryAccountOf", [owner]),
    ]);
    return { recovery, removal, clock, ownAccount, trustedOf, recoveryAccount };
  }, [accountId, l?.newOwner]);
  const chain = useRead(l ? `recover-chain:${linkId}` : null, fetchChain, { intervalMs: 10_000 });
  const profile = useProfileName(l ? accountId : undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [proof, setProof] = useState<string | null>(null);
  const [dropped, setDropped] = useState(false);

  if (typeof role !== "object") return null;
  const name = profile.data ? shortName(profile.data) : t("parent.yourStudent");
  const home = { href: "/app/parent", label: t("order.backHome") };
  if (accountId === undefined || link.data === "notForYou")
    return (
      <Message
        kicker={t("recover.kicker")}
        title={t("approve.notForYou")}
        body={t("recover.notForYouBody")}
      />
    );
  if (link.data === "invalid")
    return (
      <Message
        kicker={t("recover.kicker")}
        title={t("recover.kicker")}
        body={t("recover.invalid")}
      />
    );
  if (link.error || chain.error) {
    return (
      <div className="p-5">
        <InlineMessage
          kind="offline"
          onRetry={() => {
            link.refetch();
            chain.refetch();
          }}
        >
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  const c = chain.data;
  if (!l || !c || profile.loading)
    return <div className="p-5 text-muted">{t("common.loading")}</div>;
  const state = approvalPageState({
    dismissed: l.dismissed || dropped,
    accountId,
    newOwner: l.newOwner,
    ownAccount: c.ownAccount,
    trustedOf: c.trustedOf,
    recoveryAccount: c.recoveryAccount,
    removalActive: c.removal[0],
    recovery: { active: c.recovery[0], data: c.recovery[2] },
  });
  const at = (s: bigint) => formatDayTime(Number(s), lang);

  switch (state) {
    case "dropped":
      return (
        <Message
          kicker={t("recover.kicker")}
          title={t("recover.dropped")}
          body={t("recover.droppedBody", { name })}
          action={home}
        />
      );
    case "done":
      return (
        <Message
          kicker={t("recover.kicker")}
          title={t("recover.done")}
          body={t("recover.doneBody", { name })}
          action={home}
        />
      );
    case "unusable":
      return (
        <Message
          kicker={t("recover.kicker")}
          title={t("recover.unusable")}
          body={t("recover.unusableBody", { name })}
          action={home}
        />
      );
    case "notNow":
      return (
        <Message
          kicker={t("recover.kicker")}
          title={t("recover.notNow")}
          body={t("recover.notNowBody", { name })}
          action={home}
        />
      );
    case "approved":
      return (
        <Message
          kicker={t("recover.kicker")}
          title={t("recover.approved")}
          body={t("recover.approvedBody", { name, at: at(c.recovery[1]) })}
          action={home}
          proof={proof}
        />
      );
    default:
      break;
  }

  const approve = () => {
    if (busy) return;
    setError(null);
    const onStatus = (s: TxStatus) => {
      setBusy(t(s === "funding" || s === "confirming" || s === "slow" ? `tx.${s}` : "tx.sending"));
    };
    sendUserTx(
      { functionName: "approveRecovery", args: [accountId, l.newOwner] },
      { onStatus },
    ).then(
      (r) => {
        setBusy(null);
        setProof(r.hash);
        chain.refetch();
      },
      (e: unknown) => {
        setBusy(null);
        chain.refetch();
        setError(errorKey(e, hasKey) as Key);
      },
    );
  };
  const dismiss = () => {
    setError(null);
    api
      .post(
        `/api/recovery/${linkId}/dismiss`,
        {},
        { auth: { action: "recovery.dismiss", accountId } },
      )
      .then(() => {
        setDropped(true);
      })
      .catch((e: unknown) => {
        setError(errorKey(e, hasKey) as Key);
      });
  };
  const replaces = c.recovery[0];

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-8 pb-6">
      <div className="text-[0.875rem] font-bold text-muted uppercase">{t("recover.kicker")}</div>
      <h1 className="user-text m-0 text-[1.5rem] leading-tight font-bold">
        {t("recover.heading", { name })}
      </h1>
      <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border">
        <Row label={t("recover.askedFrom")}>{t("recover.aNewPasskey")}</Row>
        <Row label={t("recover.sent")}>{formatDayTime(Date.parse(l.createdAt) / 1000, lang)}</Row>
        <Row label={t("recover.ifApprove")}>
          {t("recover.movesOnShort", { at: at(c.clock + 48n * 3600n) })}
        </Row>
        {replaces ? <p className="m-0 py-3 text-[0.875rem]">{t("recover.replaces")}</p> : null}
      </div>
      <div className="flex items-start gap-3 rounded-[16px] bg-wait-bg px-4 py-3.5 text-[0.875rem] text-wait">
        <TriangleAlert size={20} aria-hidden="true" className="mt-px shrink-0" />
        <span className="user-text">{t("recover.warning", { name })}</span>
      </div>
      <p className="user-text m-0 text-[0.875rem] text-muted">
        {t("recover.afterApprove", { name })}
      </p>
      <div className="flex-1" />
      {error ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}
      {state === "busyElsewhere" ? (
        <InlineMessage>{t("recover.busyElsewhere", { name })}</InlineMessage>
      ) : (
        <>
          <Button parent busyLabel={busy} onClick={approve}>
            <Fingerprint size={20} aria-hidden="true" />
            {t("approve.approve")}
          </Button>
          <p className="m-0 text-center text-[0.875rem] text-muted">{t("approve.helper")}</p>
        </>
      )}
      <Button
        parent
        variant="secondary"
        onClick={() => {
          const w = window.open(
            whatsappUrl(t("recover.callText", { name }), { secret: false }),
            "_blank",
          );
          if (w) w.opener = null;
        }}
      >
        <span className="user-text">{t("recover.callFirst", { name })}</span>
      </Button>
      <Button parent variant="danger" onClick={dismiss}>
        <span className="user-text">{t("recover.notThem", { name })}</span>
      </Button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-bold">{children}</span>
    </div>
  );
}

function Message({
  kicker,
  title,
  body,
  action,
  proof,
}: {
  kicker: string;
  title: string;
  body: string;
  action?: { href: string; label: string };
  proof?: string | null;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-8 pb-6">
      <div className="text-[0.875rem] font-bold text-muted uppercase">{kicker}</div>
      <h1 className="m-0 text-[1.5rem] font-bold">{title}</h1>
      <p className="user-text m-0">{body}</p>
      {proof ? <ProofLink href={proofUrl(proof)} what={title} /> : null}
      <div className="flex-1" />
      {action ? (
        <ButtonLink parent href={action.href}>
          {action.label}
        </ButtonLink>
      ) : null}
    </div>
  );
}
