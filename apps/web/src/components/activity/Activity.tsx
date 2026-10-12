// Board 2.9 Activity (11 S11-15 to S11-20): everything newest first, from the indexer, with shop names
// from the server. When the indexer is down or behind, "History is catching up" and nothing waits on it.
"use client";
import { formatDay } from "@amplop/shared/dates";
import { toBig, type PurchaseRow } from "@amplop/shared/indexer";
import { shopKind } from "@amplop/shared/mcc";
import { formatUsd } from "@amplop/shared/money";
import { dayOf } from "@amplop/shared/schedule";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { Button, InfoBox, StatusBadge, TabBar, TopBar } from "@/components/ui";
import { useSession } from "@/lib/client/account";
import {
  apiPurchaseId,
  buildRows,
  envelopeIndex,
  useActivity,
  usePurchaseNames,
  type ActivityRow,
} from "@/lib/client/activity";
import { read } from "@/lib/client/chain/client";
import { useTrustedName } from "@/lib/client/data";
import { useHome } from "@/lib/client/home";
import { useT, type Key } from "@/lib/client/i18n";
import { useIndexerBehind } from "@/lib/client/indexer";
import { useRead } from "@/lib/client/query";

const MINUS = "−";

/** The badge for a purchase's state (S11-16). */
export function purchaseBadge(p: Pick<PurchaseRow, "status">): {
  kind: "ok" | "wait" | "bad";
  key: Key;
} {
  switch (p.status) {
    case "Held":
      return { kind: "wait", key: "activity.onHold" };
    case "Collected":
      return { kind: "ok", key: "activity.collected" };
    case "Released":
      return { kind: "ok", key: "activity.released" };
    case "Refunded":
      return { kind: "ok", key: "activity.refunded" };
    default:
      return { kind: "bad", key: "activity.declined" };
  }
}

/** What the purchase costs the student now; 0 when nothing was taken. */
export function chargedNow(p: PurchaseRow): bigint {
  if (p.status === "Held") return toBig(p.held);
  if (p.status === "Collected" || p.status === "Refunded")
    return toBig(p.collected) - toBig(p.refunded);
  return 0n;
}

export function Activity() {
  const { t, lang } = useT();
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const [limit, setLimit] = useState(100);
  const activity = useActivity(accountId, limit);
  const names = usePurchaseNames(accountId);
  const home = useHome(accountId);
  const trusted = useTrustedName(accountId);
  const behind = useIndexerBehind();

  // Declined "not enough" rows show the envelope the shop maps to now (S11-16), read once per type.
  const declinedTypes = [
    ...new Set(
      (activity.data?.Purchase ?? [])
        .filter((p) => p.declineReason === "NotEnough")
        .map((p) => p.shopType),
    ),
  ].sort((a, b) => a - b);
  const fetchMapped = useCallback(async () => {
    const out = new Map<number, number>();
    for (const type of declinedTypes) {
      const r = await read<readonly [number, boolean]>("shopEnvelope", [accountId, type]);
      out.set(type, r[0]);
    }
    return out;
    // declinedTypes is rebuilt each render; its joined value is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, declinedTypes.join(",")]);
  const mapped = useRead(
    accountId === undefined
      ? null
      : `shop-envelopes:${String(accountId)}:${declinedTypes.join(",")}`,
    fetchMapped,
  );

  if (accountId === undefined) return null;
  const h = home.data;
  const today = h ? dayOf(h.clock) : 0;
  const down = behind || Boolean(activity.error);
  // The read cache keeps the last list through a failed refresh, so it stays under the line (S11-20).
  const rows = activity.data && h ? buildRows(activity.data, today) : null;
  const usd = (u: bigint) => formatUsd(u, h?.decimals ?? 6);
  const from = trusted ?? t("common.yourTrustedPerson");

  const heading = (day: number) =>
    day === today
      ? t("activity.today")
      : day === today - 1
        ? t("activity.yesterday")
        : formatDay(day * 86_400, lang);

  const groups: { day: number; rows: ActivityRow[] }[] = [];
  for (const r of rows ?? []) {
    const g = groups.at(-1);
    if (g?.day === r.day) g.rows.push(r);
    else groups.push({ day: r.day, rows: [r] });
  }

  return (
    <>
      <TopBar back="/app" title={t("tab.activity")} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pt-1 pb-6">
        {down ? (
          <InfoBox>
            <span data-testid="activity-catching-up">{t("activity.catchingUp")}</span>
            {rows ? null : <div>{t("activity.balancesUpToDate")}</div>}
          </InfoBox>
        ) : null}
        {!rows ? (
          down ? null : (
            <div className="text-muted">{t("common.loading")}</div>
          )
        ) : rows.length === 0 ? (
          <p className="m-0 text-muted">{t("activity.empty")}</p>
        ) : (
          groups.map((g) => (
            <section key={g.day} className="flex flex-col gap-2">
              <h2 className="m-0 text-[0.875rem] font-bold text-muted">{heading(g.day)}</h2>
              <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border">
                {g.rows.map((r) => (
                  <Row
                    key={r.key}
                    r={r}
                    usd={usd}
                    from={from}
                    trusted={trusted}
                    names={names.data}
                    mapped={mapped.data}
                  />
                ))}
              </div>
            </section>
          ))
        )}
        {rows &&
        activity.data &&
        activity.data.Purchase.length + activity.data.Deposit.length >= limit ? (
          <Button
            variant="secondary"
            onClick={() => {
              setLimit((n) => n + 100);
            }}
          >
            {t("activity.older")}
          </Button>
        ) : null}
      </div>
      <TabBar current="activity" />
    </>
  );
}

function Row({
  r,
  usd,
  from,
  trusted,
  names,
  mapped,
}: {
  r: ActivityRow;
  usd: (u: bigint) => string;
  from: string;
  trusted: string | null;
  names: Map<string, { merchantName: string }> | undefined;
  mapped: Map<number, number> | undefined;
}) {
  const { t } = useT();
  const green = "amount shrink-0 font-bold text-ok";
  const muted = "amount shrink-0 text-muted";
  switch (r.kind) {
    case "deposit":
      return (
        <Line
          href={`/app/arrived/${r.d.id}?tx=${r.d.txHash}`}
          title={t("activity.allowanceFrom", { name: from })}
          sub={t("activity.split5")}
          right={<span className={green}>+{usd(toBig(r.d.amount))}</span>}
        />
      );
    case "release":
      return (
        <Line
          title={t("activity.weekShare", { k: r.k })}
          sub={t("activity.weeklyEnvelopes")}
          right={<span className={green}>+{usd(r.amount)}</span>}
        />
      );
    case "emergency":
      return (
        <Line
          title={t("emergency.opened")}
          sub={t("activity.movedToEveryday")}
          right={<span className={green}>+{usd(toBig(r.e.openedAmount ?? r.e.amount))}</span>}
        />
      );
    case "purchase": {
      const p = r.p;
      const title = names?.get(apiPurchaseId(p.id))?.merchantName ?? shopKind(p.shopType).label;
      const badge = purchaseBadge(p);
      const charged = chargedNow(p);
      const env =
        p.declineReason === "NotEnough"
          ? (mapped?.get(p.shopType) ?? -1)
          : envelopeIndex(p.envelope);
      const envName = env >= 0 ? t(`envelope.${String(env)}` as Key) : null;
      return (
        <Line
          href={`/app/activity/${apiPurchaseId(p.id)}`}
          title={<span className="user-text">{title}</span>}
          sub={
            <span className="flex flex-wrap items-center gap-1.5">
              {p.declineReason === "Blocked" ? null : envName ? (
                <span>
                  {envName}
                  {p.moved ? ` · ${t("activity.moved")}` : ""}
                </span>
              ) : null}
              <StatusBadge kind={badge.kind}>{t(badge.key)}</StatusBadge>
              {p.declineReason === "Blocked" && trusted ? (
                <span className="user-text">{t("activity.canSee", { name: trusted })}</span>
              ) : null}
            </span>
          }
          right={
            charged > 0n ? (
              <span className="amount shrink-0 font-bold">
                {MINUS}
                {usd(charged)}
              </span>
            ) : (
              <span className={muted}>{usd(0n)}</span>
            )
          }
        />
      );
    }
  }
}

function Line({
  href,
  title,
  sub,
  right,
}: {
  href?: string;
  title: ReactNode;
  sub: ReactNode;
  right: ReactNode;
}) {
  const body = (
    <>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-[0.9375rem] font-bold">{title}</div>
        <div className="text-[0.8125rem] text-muted">{sub}</div>
      </div>
      {right}
    </>
  );
  const cls = "flex min-h-[60px] items-center justify-between gap-3 py-2 text-ink no-underline";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
