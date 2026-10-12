// Boards 2.6 Approved, 2.7 Declined blocked and 2.8 Declined empty (09 S09-21 to S09-24), with the
// demo Collect now button (15 S15-13). Rebuilds from the chain and GET /api/purchases on reload.
"use client";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { formatDay } from "@amplop/shared/dates";
import { formatShopAmount, formatUsd } from "@amplop/shared/money";
import { dayOf, nextRelease, type Schedule } from "@amplop/shared/schedule";
import { CircleX, Info } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { pad, parseEventLogs, type Hash } from "viem";
import {
  Button,
  ButtonLink,
  EnvelopeChip,
  InlineMessage,
  ProofLink,
  ResultHeader,
  StatusBadge,
} from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { api, ApiError } from "@/lib/client/api";
import { blockedCategory } from "@/lib/client/card/shops";
import { ENVELOPE_INDEX, takeHandOff, type ShopLine } from "@/lib/client/card/result";
import { publicClient, read } from "@/lib/client/chain/client";
import { proofUrl } from "@/lib/client/chain/write";
import { useTrustedName } from "@/lib/client/data";
import { DEMO } from "@/lib/client/env";
import { useT, type Key } from "@/lib/client/i18n";
import { invalidateAll, useRead } from "@/lib/client/query";

type Outcome = {
  result: "approved" | "declined";
  envelope: number; // paying envelope (approved) or matched envelope (not enough)
  everydayStepIn: boolean;
  /** The shop type's own envelope, when Everyday stepped in for it (09 S09-22, E3). */
  matched?: number;
  reason?: "blocked" | "not_enough";
  amount: bigint;
  shopType: number;
};

type EnvelopeView = { available: bigint; unreleased: bigint; held: bigint; locked: bigint };
type PurchaseView = { accountId: bigint; createdAt: bigint; state: number; envelope: number };

const HOLD_PERIOD = 7n * 86400n;
const STATE_KEY = [
  "",
  "result.held",
  "result.collected",
  "result.released",
  "result.refunded",
] as const;

export function Result() {
  const { t, lang } = useT();
  const id = useParams<{ id: string }>().id;
  const params = useSearchParams();
  const tx = params.get("tx");
  const ms = params.get("ms");
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const trusted = useTrustedName(accountId);
  const handed = takeHandOff(id);
  const idBytes = /^[0-9a-f]{32}$/.test(id) ? pad(`0x${id}`, { size: 32 }) : null;

  const withMatched = useCallback(
    async (o: Outcome): Promise<Outcome> =>
      o.everydayStepIn
        ? {
            ...o,
            matched: (
              await read<readonly [number, boolean]>("shopEnvelope", [accountId, o.shopType])
            )[0],
          }
        : o,
    [accountId],
  );
  const loadOutcome = useCallback(async (): Promise<Outcome | null> => {
    if (handed) {
      const r = handed.response;
      return withMatched({
        result: r.result,
        envelope: r.envelope ? ENVELOPE_INDEX[r.envelope] : 3,
        everydayStepIn: r.everydayStepIn,
        ...(r.reason ? { reason: r.reason } : {}),
        amount: BigInt(r.amountUnits),
        shopType: handed.shop.mcc,
      });
    }
    if (!tx || !idBytes) return null;
    const receipt = await publicClient
      .getTransactionReceipt({ hash: tx as Hash })
      .catch(() => null);
    if (!receipt) return null;
    const logs = parseEventLogs({
      abi: amplopEnvelopesAbi,
      logs: receipt.logs,
      eventName: ["PurchaseApproved", "PurchaseDeclined"],
    }).filter((l) => (l.args as { purchaseId?: string }).purchaseId === idBytes);
    const l = logs[0];
    if (!l || logs.length !== 1) return null;
    const a = l.args as Record<string, unknown>;
    if (l.eventName === "PurchaseApproved") {
      return withMatched({
        result: "approved",
        envelope: Number(a.envelope),
        everydayStepIn: Boolean(a.everydayStepIn),
        amount: a.amount as bigint,
        shopType: Number(a.shopType),
      });
    }
    const reason = Number(a.reason) === 1 ? "blocked" : "not_enough";
    const matched = await read<readonly [number, boolean]>("shopEnvelope", [
      accountId,
      Number(a.shopType),
    ]);
    return {
      result: "declined",
      envelope: matched[0],
      everydayStepIn: false,
      reason,
      amount: a.amount as bigint,
      shopType: Number(a.shopType),
    };
  }, [handed, tx, idBytes, accountId, withMatched]);
  const outcome = useRead(accountId === undefined ? null : `outcome:${id}`, loadOutcome);

  const loadShop = useCallback(async (): Promise<ShopLine | null> => {
    if (handed) return handed.shop;
    const r = await api.get<{
      items: {
        purchaseId: string;
        merchantName: string;
        merchantCity: string;
        currency: "EUR" | "USD" | "IDR";
        amount: string;
      }[];
    }>("/api/purchases", { auth: { action: "purchases.read", accountId } });
    const it = r.items.find((x) => x.purchaseId === id);
    return it
      ? {
          merchantName: it.merchantName,
          merchantCity: it.merchantCity,
          currency: it.currency,
          amountMinor: BigInt(it.amount),
          mcc: 0,
        }
      : null;
  }, [handed, id, accountId]);
  const shop = useRead(accountId === undefined ? null : `shopline:${id}`, loadShop);

  const loadLive = useCallback(async () => {
    const [p, env, clock, schedules, decimals] = await Promise.all([
      read<PurchaseView>("purchase", [idBytes]),
      read<readonly [readonly EnvelopeView[], bigint]>("envelopes", [accountId]),
      read<bigint>("clock", [accountId]),
      read<readonly Schedule[]>("schedules", [accountId]),
      read<number>("tokenDecimals"),
    ]);
    return {
      p,
      envelopes: env[0],
      nextReleaseDay: env[1],
      clock,
      schedules,
      decimals,
    };
  }, [idBytes, accountId]);
  const live = useRead(accountId === undefined || !idBytes ? null : `live:${id}`, loadLive);

  const [collecting, setCollecting] = useState(false);
  const [collectTx, setCollectTx] = useState<string | null>(null);
  const [collectError, setCollectError] = useState<string | null>(null);

  if (accountId === undefined) return null;
  if ((!outcome.loading && outcome.data === null) || !idBytes) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <p className="m-0">{t("result.notFound")}</p>
        <ButtonLink href="/app/card">{t("result.backToCard")}</ButtonLink>
      </div>
    );
  }
  if (outcome.error || live.error) {
    return (
      <div className="p-5">
        <InlineMessage
          kind="offline"
          onRetry={() => {
            outcome.refetch();
            live.refetch();
          }}
        >
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  const o = outcome.data;
  const l = live.data;
  if (!o || !l) return <div className="p-5 text-muted">{t("common.loading")}</div>;
  const d = l.decimals;
  const usd = formatUsd(o.amount, d);
  const s = shop.data;
  const envName = (i: number) => t(`envelope.${String(i)}` as Key);
  const shopLine = s
    ? t("result.at", {
        shopAmount: formatShopAmount(s.currency, s.amountMinor),
        shop: s.merchantName,
        city: s.merchantCity,
      })
    : null;

  if (o.result === "approved") {
    const held = l.p.state === 1;
    const canCollect = DEMO && held && l.clock < l.p.createdAt + HOLD_PERIOD;
    const collect = () => {
      setCollecting(true);
      setCollectError(null);
      api
        .post<{ state: string; txHash: string }>(
          "/api/card/collect",
          { purchaseId: id },
          { auth: { action: "card.collect", accountId } },
        )
        .then((r) => {
          setCollectTx(r.txHash);
          invalidateAll();
        })
        .catch((e: unknown) => {
          setCollectError(e instanceof ApiError ? e.message : t("error.generic"));
          invalidateAll();
        })
        .finally(() => {
          setCollecting(false);
        });
    };
    return (
      <div className="flex min-h-dvh flex-1 flex-col gap-5 px-5 pt-12 pb-6">
        <ResultHeader ok title={t("result.approved")} amount={usd}>
          {shopLine ? (
            <div className="amount user-text text-[0.875rem] text-muted">{shopLine}</div>
          ) : null}
        </ResultHeader>
        <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 pb-4">
          <Row label={t("result.from")}>
            <EnvelopeChip index={o.envelope} />
          </Row>
          {o.everydayStepIn ? (
            <p className="m-0 border-b border-border py-2 text-[0.875rem] text-muted">
              {t("result.stepIn", { matched: envName(o.matched ?? 0) })}
            </p>
          ) : null}
          <Row label={t("result.left", { envelope: envName(o.envelope) })}>
            <span
              className="amount font-bold"
              data-testid={`envelope-available-${String(o.envelope)}`}
            >
              {formatUsd(l.envelopes[o.envelope]?.available ?? 0n, d)}
            </span>
          </Row>
          <Row label={t("result.status")} last>
            <StatusBadge kind={held ? "wait" : l.p.state === 3 || l.p.state === 4 ? "info" : "ok"}>
              {t(STATE_KEY[l.p.state] || "result.held")}
            </StatusBadge>
          </Row>
          {held ? (
            <div className="rounded-[12px] bg-wait-bg px-3 py-2.5 text-[0.875rem] text-wait">
              {t("result.holdInfo", { amount: usd })}
            </div>
          ) : null}
          {canCollect ? (
            <Button
              variant="text"
              className="mt-1 text-[0.875rem]"
              busyLabel={collecting ? t("result.collecting") : null}
              onClick={collect}
            >
              {t("result.collectNow")}
            </Button>
          ) : null}
          {collectError ? <InlineMessage kind="error">{collectError}</InlineMessage> : null}
          {collectTx ? <ProofLink href={proofUrl(collectTx)} what={t("result.collected")} /> : null}
        </div>
        <div className="flex flex-col gap-2 rounded-[16px] bg-quiet px-4 pt-3.5 pb-1">
          <div className="text-[0.875rem] font-bold text-muted">{t("result.detail")}</div>
          <div className="flex justify-between text-[0.875rem]">
            <span className="text-muted">{t("result.value")}</span>
            <span className="amount">{usd.slice(1)} AUSD</span>
          </div>
          {ms ? (
            <div className="flex justify-between text-[0.875rem]">
              <span className="text-muted">{t("result.confirmedIn")}</span>
              <span className="amount">
                {t("result.seconds", { n: (Number(ms) / 1000).toFixed(1).replace(".", ",") })}
              </span>
            </div>
          ) : null}
          {tx ? <ProofLink href={proofUrl(tx)} what={t("result.approved")} /> : null}
        </div>
        <div className="flex-1" />
        <ButtonLink href="/app/activity">{t("result.done")}</ButtonLink>
      </div>
    );
  }

  if (o.reason === "blocked") {
    const category = blockedCategory(o.shopType);
    return (
      <div className="flex min-h-dvh flex-1 flex-col gap-6 px-5 pt-14 pb-6">
        <ResultHeader ok={false} title={t("result.declined")}>
          <p className="m-0 max-w-[300px] text-[1.125rem] font-bold">
            {t(category ? "result.blockedGambling" : "result.blockedOther")}
          </p>
        </ResultHeader>
        <Lines
          lines={[
            t("result.noMoneyAny"),
            trusted
              ? category
                ? t("result.trustedSees", {
                    name: trusted,
                    category: t(`result.category.${category}` as Key),
                  })
                : t("result.trustedSeesOther", { name: trusted })
              : t("result.categoryOnly"),
          ]}
        />
        <div className="flex-1" />
        <div className="flex flex-col gap-2">
          <ButtonLink href="/app/card">{t("result.backToCard")}</ButtonLink>
          <ButtonLink variant="text" href="/app/activity">
            {t("result.viewActivity")}
          </ButtonLink>
        </div>
      </div>
    );
  }

  // Not enough (2.8): the matched envelope and, when it is not Everyday, Everyday too.
  const matched = o.envelope;
  const today = dayOf(l.clock);
  const next = nextRelease(l.schedules, today);
  const nextDay = l.nextReleaseDay > 0n ? Number(l.nextReleaseDay) : next?.day;
  const share = next?.perEnvelope[matched] ?? 0n;
  const emergencyLocked = l.envelopes[4]?.locked ?? 0n;
  return (
    <div className="flex min-h-dvh flex-1 flex-col gap-5 px-5 pt-12 pb-6">
      <ResultHeader ok={false} title={t("result.declined")}>
        <p className="m-0 max-w-[310px] text-[1.125rem] font-bold">
          {matched === 3
            ? t("result.emptyEveryday")
            : t("result.emptyMatched", { envelope: envName(matched) })}
        </p>
        {s ? (
          <div className="amount user-text text-[0.875rem] text-muted">
            {t("result.atWithUsd", {
              shopAmount: formatShopAmount(s.currency, s.amountMinor),
              shop: s.merchantName,
              city: s.merchantCity,
              usd,
            })}
          </div>
        ) : null}
      </ResultHeader>
      <div className="flex flex-col rounded-[16px] border border-border bg-card px-4">
        <Row label={t("result.needed")}>
          <span className="amount font-bold">{usd}</span>
        </Row>
        <Row label={t("result.has", { envelope: envName(matched) })}>
          <span className="amount font-bold">
            {formatUsd(l.envelopes[matched]?.available ?? 0n, d)}
          </span>
        </Row>
        {matched !== 3 ? (
          <Row label={t("result.has", { envelope: envName(3) })}>
            <span className="amount font-bold">
              {formatUsd(l.envelopes[3]?.available ?? 0n, d)}
            </span>
          </Row>
        ) : null}
        <Row label={t("result.nextShare")} last>
          <span className="amount font-bold">
            {next && share > 0n && nextDay
              ? `${formatDay(nextDay * 86400, lang)} · ${formatUsd(share, d)}`
              : t("result.noneDue")}
          </span>
        </Row>
      </div>
      <Lines
        lines={[
          t("result.noMoney"),
          matched === 3 ? t("result.keptEveryday") : t("result.keptOther"),
        ]}
      />
      <div className="flex-1" />
      <div className="flex flex-col gap-2">
        <ButtonLink href="/app/card">{t("result.backToCard")}</ButtonLink>
        {emergencyLocked > 0n ? (
          <ButtonLink variant="text" href="/app/emergency">
            {t("result.emergency")}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  label,
  children,
  last = false,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[52px] items-center justify-between gap-3 text-[0.9375rem] ${last ? "" : "border-b border-border"}`}
    >
      <span className="text-muted">{label}</span>
      {children}
    </div>
  );
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-[16px] border border-border bg-card p-4">
      {lines.map((line, i) => (
        <div key={line} className="flex items-start gap-3">
          {i === 0 ? (
            <CircleX size={20} aria-hidden="true" className="shrink-0 text-bad" />
          ) : (
            <Info size={20} aria-hidden="true" className="shrink-0 text-info" />
          )}
          <div className="user-text text-[0.9375rem]">{line}</div>
        </div>
      ))}
    </div>
  );
}
