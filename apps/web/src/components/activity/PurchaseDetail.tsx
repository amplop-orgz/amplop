// Board 2.10 Purchase detail and Move a purchase (11 S11-21 to S11-26). State and the move rules come
// from the contract; the indexer only fills in declined purchases and the proof link.
"use client";
import { formatDay } from "@amplop/shared/dates";
import { PurchaseByIdQuery, toBig, type PurchaseByIdResult } from "@amplop/shared/indexer";
import { shopKind } from "@amplop/shared/mcc";
import { formatShopAmount, formatUsd } from "@amplop/shared/money";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { pad } from "viem";
import {
  Button,
  ButtonLink,
  EnvelopeChip,
  InfoBox,
  InlineMessage,
  ProofLink,
  StatusBadge,
  TopBar,
} from "@/components/ui";
import { CollectNowButton } from "@/components/demo/DemoControls";
import { useSession } from "@/lib/client/account";
import { ENVELOPE_NAMES, envelopeIndex, usePurchaseNames } from "@/lib/client/activity";
import { read } from "@/lib/client/chain/client";
import { ChainError, proofUrl, sendUserTx, type TxStatus } from "@/lib/client/chain/write";
import { useTrustedName } from "@/lib/client/data";
import { errorKey } from "@/lib/client/errors";
import { useHome } from "@/lib/client/home";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import { gql, useIndexerBehind } from "@/lib/client/indexer";
import { useRead } from "@/lib/client/query";
import { purchaseBadge } from "./Activity";

const MINUS = "−";
const MOVE_PERIOD = 7n * 86_400n;
const HOLD_PERIOD = 7n * 86_400n;
const STATE = ["Declined", "Held", "Collected", "Released", "Refunded"] as const;

type OnChain = {
  accountId: bigint;
  envelope: number;
  amount: bigint;
  held: bigint;
  collected: bigint;
  refunded: bigint;
  shopType: number;
  createdAt: bigint;
  state: number;
  moved: boolean;
  everydayStepIn: boolean;
};

/** S11-23: the amount a move would shift, or 0 when the purchase cannot move. */
export function moveAmount(p: OnChain, clock: bigint): bigint {
  const m = p.state === 1 ? p.held : p.state === 2 || p.state === 4 ? p.collected - p.refunded : 0n;
  if (m <= 0n || p.envelope !== 3 || p.moved || clock >= p.createdAt + MOVE_PERIOD) return 0n;
  return m;
}

export function PurchaseDetail() {
  const { t, lang } = useT();
  const id = useParams<{ id: string }>().id;
  const valid = /^[0-9a-f]{32}$/.test(id);
  const idBytes = valid ? pad(`0x${id}`, { size: 32 }) : null;
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const home = useHome(accountId);
  const names = usePurchaseNames(accountId);
  const trusted = useTrustedName(accountId);
  const behind = useIndexerBehind();
  const fetchChain = useCallback(() => read<OnChain>("purchase", [idBytes]), [idBytes]);
  const chainRead = useRead(idBytes ? `purchase:${id}` : null, fetchChain, { intervalMs: 15_000 });
  const fetchIndexed = useCallback(
    () => gql<PurchaseByIdResult>(PurchaseByIdQuery, { id: idBytes }).then((r) => r.Purchase_by_pk),
    [idBytes],
  );
  const indexed = useRead(idBytes ? `purchase-indexed:${id}` : null, fetchIndexed);
  const [target, setTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState<{ to: number; hash: string } | null>(null);

  if (accountId === undefined) return null;
  const notFound = (key: Key, extra?: boolean) => (
    <>
      <TopBar back="/app/activity" title={t("purchase.title")} />
      <div className="flex flex-col gap-4 px-5 pt-1 pb-6">
        <p className="m-0">{t(key)}</p>
        {extra ? <InfoBox>{t("activity.catchingUp")}</InfoBox> : null}
        <ButtonLink href="/app/activity">{t("purchase.toActivity")}</ButtonLink>
      </div>
    </>
  );
  if (!valid) return notFound("purchase.notFound");
  if (chainRead.error || home.error) {
    return (
      <div className="p-5">
        <InlineMessage
          kind="offline"
          onRetry={() => {
            chainRead.refetch();
            home.refetch();
          }}
        >
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  const c = chainRead.data;
  const h = home.data;
  if (!c || !h) return <div className="p-5 text-muted">{t("common.loading")}</div>;
  const ix = indexed.data ?? null;
  if (c.state === 0 && !ix) {
    if (indexed.loading && !behind)
      return <div className="p-5 text-muted">{t("common.loading")}</div>;
    return notFound("purchase.notYet", true);
  }
  const owner = c.state !== 0 ? c.accountId : toBig(ix?.accountId ?? 0);
  if (owner !== accountId) return notFound("purchase.notYours");

  const usd = (u: bigint) => formatUsd(u, h.decimals);
  const shop = names.data?.get(id);
  const shopType = c.state !== 0 ? c.shopType : (ix?.shopType ?? 0);
  const title = shop?.merchantName ?? shopKind(shopType).label;
  const declined = c.state === 0;
  const envelope = declined ? -1 : c.envelope;
  const charged =
    c.state === 1 ? c.held : c.state === 2 || c.state === 4 ? c.collected - c.refunded : 0n;
  const amount = declined ? toBig(ix?.amount ?? 0) : c.amount;
  const when = declined ? Number(toBig(ix?.accountClock ?? 0)) : Number(c.createdAt);
  const badge = purchaseBadge({ status: declined ? "Declined" : (STATE[c.state] ?? "Held") });
  const m = moveAmount(c, h.clock);
  const kind = shopKind(shopType);
  // S11-24: Study is preselected for a bookshop when it can take the amount.
  const chosen = target ?? (shopType === 5942 && (h.envelopes[2]?.available ?? 0n) >= m ? 2 : null);

  const move = () => {
    if (chosen === null || busy) return;
    setError(null);
    const onStatus = (s: TxStatus) => {
      setBusy(t(s === "funding" || s === "confirming" || s === "slow" ? `tx.${s}` : "tx.sending"));
    };
    sendUserTx({ functionName: "movePurchase", args: [idBytes, chosen] }, { onStatus }).then(
      (r) => {
        setBusy(null);
        setMoved({ to: chosen, hash: r.hash });
      },
      (e: unknown) => {
        setBusy(null);
        chainRead.refetch();
        setError(
          e instanceof ChainError && e.errorName === "TargetShort"
            ? t("purchase.targetShort", { target: t(`envelope.${String(chosen)}` as Key) })
            : t(errorKey(e, hasKey) as Key),
        );
      },
    );
  };

  return (
    <>
      <TopBar back="/app/activity" title={t("purchase.title")} />
      <div className="flex flex-col gap-4 px-5 pt-1 pb-6">
        <div className="flex flex-col items-center gap-1 py-2 text-center">
          <div className="user-text font-bold">
            {shop ? `${shop.merchantName} · ${shop.merchantCity}` : title}
          </div>
          <div className="amount text-[2rem] leading-tight font-bold" data-testid="purchase-amount">
            {charged > 0n ? `${MINUS}${usd(charged)}` : usd(declined ? amount : 0n)}
          </div>
          <div className="amount text-[0.875rem] text-muted">
            {shop
              ? `${formatShopAmount(shop.currency, BigInt(shop.amount))} · ${formatDay(when, lang)}`
              : formatDay(when, lang)}
          </div>
        </div>
        <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border">
          {envelope >= 0 ? (
            <div className="flex min-h-14 items-center justify-between">
              <span className="text-muted">{t("purchase.paidFrom")}</span>
              <EnvelopeChip index={moved ? moved.to : envelope} />
            </div>
          ) : null}
          <div className="flex min-h-14 items-center justify-between">
            <span className="text-muted">{t("result.status")}</span>
            <StatusBadge kind={badge.kind}>{t(badge.key)}</StatusBadge>
          </div>
          {declined ? (
            <p className="m-0 py-3 text-[0.875rem]">
              {ix?.declineReason === "Blocked"
                ? t("purchase.blocked")
                : t("purchase.notEnough", {
                    envelope: t(
                      `envelope.${String(envelopeIndex(ix?.envelope ?? null) >= 0 ? envelopeIndex(ix?.envelope ?? null) : 3)}` as Key,
                    ),
                  })}
            </p>
          ) : null}
        </div>
        {/* 15 S15-13: the Collect now slot, held purchases in their hold period only. */}
        <CollectNowButton
          purchaseId={id}
          accountId={accountId}
          show={c.state === 1 && h.clock < c.createdAt + HOLD_PERIOD}
        />
        {ix?.txHash ? <ProofLink href={proofUrl(ix.txHash)} what={t("purchase.title")} /> : null}

        {moved ? (
          <div className="flex flex-col gap-3">
            <StatusBadge kind="ok">
              {t("purchase.movedBadge", { target: t(`envelope.${String(moved.to)}` as Key) })}
            </StatusBadge>
            <ProofLink href={proofUrl(moved.hash)} what={t("purchase.move")} />
            <ButtonLink href="/app/activity">{t("common.done")}</ButtonLink>
          </div>
        ) : m > 0n ? (
          <section className="flex flex-col gap-3">
            <h2 className="m-0 text-[1rem] font-bold">{t("purchase.moveHeading")}</h2>
            <p className="m-0 text-[0.875rem] text-muted">{t("purchase.moveHelp")}</p>
            <MoveOptions
              m={m}
              available={h.envelopes.map((e) => e.available)}
              usd={usd}
              picked={chosen}
              onPick={setTarget}
            />
            {chosen !== null ? (
              <p className="user-text m-0 text-[0.875rem] text-muted">
                {kind.plural
                  ? t("purchase.fromNow", {
                      kind: kind.plural,
                      target: t(`envelope.${String(chosen)}` as Key),
                    })
                  : t("purchase.fromNowOther", { target: t(`envelope.${String(chosen)}` as Key) })}
                {trusted ? ` ${t("purchase.trustedSees", { name: trusted })}` : ""}
              </p>
            ) : null}
            {error ? (
              <InlineMessage kind="error" onRetry={move}>
                {error}
              </InlineMessage>
            ) : null}
            <Button disabled={chosen === null || busy !== null} busyLabel={busy} onClick={move}>
              {chosen === null
                ? t("purchase.choose")
                : t("purchase.moveTo", { target: t(`envelope.${String(chosen)}` as Key) })}
            </Button>
          </section>
        ) : null}
      </div>
    </>
  );
}

/** S11-24: Food, Transport, Study and Everyday (current); a target needs `available ≥ m`. */
function MoveOptions({
  m,
  available,
  usd,
  picked,
  onPick,
}: {
  m: bigint;
  available: readonly bigint[];
  usd: (u: bigint) => string;
  picked: number | null;
  onPick: (i: number) => void;
}) {
  const { t } = useT();
  const enabled = (i: number) => (available[i] ?? 0n) >= m;
  return (
    <div
      role="radiogroup"
      aria-label={t("purchase.moveHeading")}
      className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border"
    >
      {ENVELOPE_NAMES.slice(0, 4).map((_, i) => {
        const current = i === 3;
        const ok = !current && enabled(i);
        return (
          <label
            key={i}
            className={`flex min-h-14 items-center justify-between gap-3 ${ok ? "" : "opacity-60"}`}
          >
            <span className="flex flex-col">
              <span className="font-bold">
                {t(`envelope.${String(i)}` as Key)}
                {current ? ` · ${t("purchase.current")}` : ""}
              </span>
              {!current && !ok ? (
                <span className="amount text-[0.8125rem] text-muted">
                  {t("purchase.only", { amount: usd(available[i] ?? 0n) })}
                </span>
              ) : null}
            </span>
            <input
              type="radio"
              name="target"
              className="size-5"
              disabled={!ok}
              checked={picked === i}
              onChange={() => {
                onPick(i);
              }}
            />
          </label>
        );
      })}
    </div>
  );
}
