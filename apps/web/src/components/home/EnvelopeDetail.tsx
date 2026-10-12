// Board 2.3 Envelope detail (11 S11-11 to S11-14): the hero card and release schedule from the
// contract, and this week's spending from the indexer.
"use client";
import { formatDay } from "@amplop/shared/dates";
import { toBig } from "@amplop/shared/indexer";
import { formatShopAmount, formatUsd } from "@amplop/shared/money";
import {
  barPercent,
  dayOf,
  isSpendingFast,
  mondayDay,
  mondayNumber,
  pace,
  paceTick,
  releaseDay,
  shareAmount,
  sharesOutAt,
  thisWeekShare,
} from "@amplop/shared/schedule";
import { shopKind } from "@amplop/shared/mcc";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ButtonLink,
  ENVELOPE_BG,
  Guilloche,
  InfoBox,
  InlineMessage,
  StatusBadge,
  TopBar,
} from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { apiPurchaseId, useEnvelopePurchases, usePurchaseNames } from "@/lib/client/activity";
import { useHome } from "@/lib/client/home";
import { useT, type Key } from "@/lib/client/i18n";
import { useIndexerBehind } from "@/lib/client/indexer";
import { PaceBar, rupiahAbout } from "./Home";

const MINUS = "−";

export function EnvelopeDetail() {
  const { t, lang } = useT();
  const router = useRouter();
  const id = useParams<{ id: string }>().id;
  const index = /^[0-4]$/.test(id) ? Number(id) : -1;
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const home = useHome(accountId);
  const spent = useEnvelopePurchases(index >= 0 && index < 4 ? accountId : undefined, index);
  const names = usePurchaseNames(accountId);
  const behind = useIndexerBehind();
  useEffect(() => {
    if (index === 4) router.replace("/app/emergency");
  }, [index, router]);

  if (accountId === undefined || index === 4) return null;
  if (index < 0) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <p className="m-0">{t("envelope.notFound")}</p>
        <ButtonLink href="/app">{t("arrived.see")}</ButtonLink>
      </div>
    );
  }
  if (home.error) {
    return (
      <div className="p-5">
        <InlineMessage kind="offline" onRetry={home.refetch}>
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  const h = home.data;
  if (!h) return <div className="p-5 text-muted">{t("common.loading")}</div>;
  const usd = (u: bigint) => formatUsd(u, h.decimals);
  const today = dayOf(h.clock);
  const e = h.envelopes[index];
  const available = e?.available ?? 0n;
  const share = thisWeekShare(h.schedules, today, index);
  const p = pace(h.schedules, today);
  const pct = barPercent(available, share);
  const fast = isSpendingFast(available, share, p, today);
  const name = t(`envelope.${String(index)}` as Key);

  // S11-13: one row per share, same-day rows from two records added together, oldest first.
  const byDay = new Map<number, { amount: bigint; released: boolean }>();
  for (const r of h.schedules) {
    for (let k = 1; k <= 4; k++) {
      const d = releaseDay(r, k);
      const row = byDay.get(d) ?? { amount: 0n, released: true };
      byDay.set(d, {
        amount: row.amount + shareAmount(r, index, k),
        released: row.released && k <= sharesOutAt(r, today),
      });
    }
  }
  const schedule = [...byDay.entries()].sort((a, b) => a[0] - b[0]);

  const weekStart = mondayDay(mondayNumber(today));
  const thisWeek = (spent.data?.Purchase ?? []).filter((x) => {
    const d = Number(toBig(x.accountClock) / 86_400n);
    return d >= weekStart && d < weekStart + 7;
  });

  return (
    <>
      <TopBar back="/app" title={t("envelope.title", { name })} />
      <div className="flex flex-col gap-4 px-5 pt-1 pb-6">
        <div
          className={`relative flex flex-col gap-2 overflow-hidden rounded-[16px] px-4 py-4 text-white ${ENVELOPE_BG[index] ?? ""}`}
        >
          <Guilloche />
          <div className="relative text-[0.875rem] opacity-90">{t("home.availableWeek")}</div>
          <div
            className="amount relative text-[2rem] leading-tight font-bold"
            data-testid="envelope-available"
          >
            {usd(available)}
          </div>
          <div className="amount relative text-[0.875rem] opacity-90">
            {t("home.about", { rupiah: rupiahAbout(available, h.decimals) })}
          </div>
          <div className="relative">
            <PaceBar pct={pct} tick={p ? paceTick(p, today) : null} />
          </div>
          <div className="relative text-[0.875rem]">
            {pct === null || !p
              ? t("envelope.noShare")
              : fast
                ? t("envelope.fast")
                : t("envelope.onPlan")}
          </div>
        </div>

        <h2 className="m-0 text-[1rem] font-bold">{t("envelope.schedule")}</h2>
        <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border">
          {schedule.length === 0 ? (
            <div className="flex min-h-14 items-center">{t("home.noMoreShares")}</div>
          ) : (
            schedule.map(([d, row]) => (
              <div key={d} className="flex min-h-14 items-center justify-between gap-3">
                <span>{formatDay(d * 86_400, lang)}</span>
                <span className="flex items-center gap-2">
                  <span className="amount font-bold">{usd(row.amount)}</span>
                  <StatusBadge kind={row.released ? "ok" : "info"}>
                    {t(row.released ? "envelope.released" : "envelope.notYet")}
                  </StatusBadge>
                </span>
              </div>
            ))
          )}
        </div>
        <p className="m-0 text-[0.875rem] text-muted">{t("envelope.unspent")}</p>

        <h2 className="m-0 text-[1rem] font-bold">{t("envelope.spentWeek")}</h2>
        {behind || spent.error ? (
          <InfoBox>{t("activity.catchingUp")}</InfoBox>
        ) : !spent.data ? (
          <div className="text-muted">{t("common.loading")}</div>
        ) : thisWeek.length === 0 ? (
          <p className="m-0 text-muted">{t("envelope.nothingSpent")}</p>
        ) : (
          <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border">
            {thisWeek.map((x) => {
              const shop = names.data?.get(apiPurchaseId(x.id));
              const day = formatDay(Number(toBig(x.accountClock)), lang);
              const charged =
                x.status === "Held" ? toBig(x.held) : toBig(x.collected) - toBig(x.refunded);
              return (
                <div
                  key={x.id}
                  className="flex min-h-[60px] items-center justify-between gap-3 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="user-text text-[0.9375rem] font-bold">
                      {shop?.merchantName ?? shopKind(x.shopType).label}
                    </span>
                    <span className="amount text-[0.8125rem] text-muted">
                      {shop && shop.currency !== "USD"
                        ? `${day} · ${formatShopAmount(shop.currency, BigInt(shop.amount))}`
                        : day}
                    </span>
                  </div>
                  <span className="amount shrink-0 font-bold">
                    {MINUS}
                    {usd(charged)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
