// Board 2.2 Student home after the first allowance (11 S11-4 to S11-10). Every figure comes from the
// contract; the account clock decides the date, the week and the next release.
"use client";
import { formatDay } from "@amplop/shared/dates";
import { EmergencyStatus } from "@amplop/shared/enums";
import { formatRupiahRounded, formatUsd } from "@amplop/shared/money";
import { shortName } from "@amplop/shared/names";
import {
  barPercent,
  dayOf,
  isSpendingFast,
  nextRelease,
  pace,
  paceTick,
  thisWeekShare,
  weekCounter,
  type Pace,
} from "@amplop/shared/schedule";
import { BookOpen, Lock, Settings, ShoppingBag, TramFront, Utensils } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ENVELOPE_BG, Guilloche, InlineMessage, TabBar } from "@/components/ui";
import { ZERO_ADDRESS } from "@/lib/client/chain/client";
import { clockNow, countdownText } from "@/lib/client/emergency";
import { useT, type Key } from "@/lib/client/i18n";
import type { HomeData } from "@/lib/client/home";
import { useHome } from "@/lib/client/home";
import { rupiahOf } from "@/lib/client/topup";

export const ENVELOPE_ICONS = [Utensils, TramFront, BookOpen, ShoppingBag, Lock];

/** "About Rp2.050.000": the sample rate, rounded to the nearest Rp500 (11 decision 5). */
export function rupiahAbout(units: bigint, decimals: number): string {
  return formatRupiahRounded(rupiahOf(units, decimals), 500n);
}

export function Home({
  accountId,
  name,
  trustedName,
  banner,
}: {
  accountId: bigint;
  name: string;
  trustedName: string | null;
  banner?: ReactNode;
}) {
  const { t, lang } = useT();
  const home = useHome(accountId);
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
  const today = dayOf(h.clock);
  const week = weekCounter(h.schedules, today);
  const p = pace(h.schedules, today);
  const next = nextRelease(h.schedules, today);
  const usd = (u: bigint) => formatUsd(u, h.decimals);
  const weekly = h.envelopes.slice(0, 4);
  const total = weekly.reduce((s, e) => s + e.available, 0n);
  const contractDay = Number(h.nextReleaseDay);
  // S11-7: the contract's day wins when it has one.
  const releaseDay = contractDay > 0 ? contractDay : next?.day;
  const todayText = formatDay(Number(h.clock), lang);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="user-text m-0 text-[1.25rem] font-bold">
              {t("home.hi", { name: shortName(name) })}
            </h1>
            <div className="text-[0.875rem] text-muted" data-testid="home-date">
              {week ? t("home.dateWeek", { date: todayText, week }) : todayText}
            </div>
          </div>
          <Link
            href="/app/settings"
            aria-label={t("common.settings")}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-ink"
          >
            <Settings size={20} aria-hidden="true" />
          </Link>
        </div>
        {banner}
        <div className="flex flex-col gap-1 rounded-[16px] border border-border bg-card p-4">
          <div className="text-[0.875rem] text-muted">{t("home.availableWeek")}</div>
          <div className="amount text-[2rem] leading-tight font-bold" data-testid="home-total">
            {usd(total)}
          </div>
          <div className="amount text-[0.875rem] text-muted">
            {t("home.about", { rupiah: rupiahAbout(total, h.decimals) })}
          </div>
          <div className="amount text-[0.875rem] font-semibold" data-testid="home-next">
            {next && releaseDay
              ? t("home.nextRelease", {
                  day: formatDay(releaseDay * 86_400, lang),
                  amount: usd(next.total),
                })
              : t("home.noMoreShares")}
          </div>
        </div>
        {weekly.map((e, i) => (
          <EnvelopeTile
            key={i}
            index={i}
            h={h}
            p={p}
            today={today}
            week={week}
            available={e.available}
            unreleased={e.unreleased}
          />
        ))}
        <EmergencyTile h={h} trustedName={trustedName ?? t("common.yourTrustedPerson")} />
      </div>
      <TabBar current="envelopes" />
    </>
  );
}

/** The bar with its pace tick (S11-8); nothing when there is no share this week. */
export function PaceBar({ pct, tick }: { pct: number | null; tick: number | null }) {
  if (pct === null || tick === null) return null;
  return (
    <div className="relative h-2 w-full rounded-full bg-white/30" aria-hidden="true">
      <div className="h-2 rounded-full bg-white" style={{ width: `${String(pct)}%` }} />
      <div
        className="absolute -top-1 h-4 w-0.5 bg-ink"
        style={{ left: `${String(Math.round(tick * 100))}%` }}
      />
    </div>
  );
}

function EnvelopeTile({
  index,
  h,
  p,
  today,
  week,
  available,
  unreleased,
}: {
  index: number;
  h: HomeData;
  p: Pace | null;
  today: number;
  week: number | null;
  available: bigint;
  unreleased: bigint;
}) {
  const { t } = useT();
  const usd = (u: bigint) => formatUsd(u, h.decimals);
  const share = thisWeekShare(h.schedules, today, index);
  const fast = isSpendingFast(available, share, p, today);
  const Icon = ENVELOPE_ICONS[index] ?? Lock;
  const footer = fast
    ? unreleased > 0n
      ? t("home.fastLater", { amount: usd(unreleased) })
      : t("home.fast")
    : unreleased > 0n
      ? t("home.notReleased", { amount: usd(unreleased) })
      : t("home.allReleased");
  return (
    <Link
      href={`/app/envelope/${String(index)}`}
      className={`relative flex flex-col gap-2.5 overflow-hidden rounded-[16px] px-4 py-3.5 text-white no-underline ${ENVELOPE_BG[index] ?? ""}`}
    >
      <Guilloche />
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-2 font-bold">
          <Icon size={20} aria-hidden="true" />
          {t(`envelope.${String(index)}` as Key)}
        </span>
        <span
          className="amount text-[1.25rem] font-bold"
          data-testid={`home-available-${String(index)}`}
        >
          {usd(available)}
        </span>
      </div>
      <div className="relative">
        <PaceBar pct={barPercent(available, share)} tick={p ? paceTick(p, today) : null} />
      </div>
      <div className="relative flex items-center justify-between gap-2 text-[0.8125rem]">
        <span className="amount" data-testid={`home-footer-${String(index)}`}>
          {footer}
        </span>
        {week ? (
          <span className="flex gap-1" role="img" aria-label={t("home.weekOf", { week })}>
            {[1, 2, 3, 4].map((d) => (
              <span
                key={d}
                className={`size-2 rounded-full border border-white ${d <= week ? "bg-white" : ""}`}
              />
            ))}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export type EmergencyTileState = "lockOff" | "open" | "empty" | "alone" | "needs";

/** S11-9, checked in order. */
export function emergencyTileState(
  h: Pick<HomeData, "info" | "em" | "envelopes">,
): EmergencyTileState {
  if (!h.info.lockOn) return "lockOff";
  if (h.em.status === EmergencyStatus.Open) return "open";
  if ((h.envelopes[4]?.locked ?? 0n) === 0n) return "empty";
  if (h.info.trusted === ZERO_ADDRESS) return "alone";
  return "needs";
}

function EmergencyTile({ h, trustedName }: { h: HomeData; trustedName: string }) {
  const { t } = useT();
  const e = h.envelopes[4];
  const locked = e?.locked ?? 0n;
  const state = emergencyTileState(h);
  const amount = formatUsd(
    state === "lockOff" ? locked + (e?.available ?? 0n) : state === "empty" ? 0n : locked,
    h.decimals,
  );
  const line =
    state === "lockOff"
      ? t("home.emLockOff")
      : state === "open"
        ? t("home.emWaiting", { countdown: countdownText(t, Number(h.em.opensAt - clockNow(h))) })
        : state === "empty"
          ? t("home.emNothing")
          : state === "alone"
            ? t("home.emAlone")
            : t("home.emNeeds", { name: trustedName });
  const body = (
    <>
      <span className="flex items-center gap-2.5">
        <Lock size={20} aria-hidden="true" />
        <span className="flex flex-col">
          <span className="font-bold">{t("envelope.4")}</span>
          <span className="user-text text-[0.8125rem] opacity-90" data-testid="home-emergency-line">
            {line}
          </span>
        </span>
      </span>
      <span className="amount text-[1.25rem] font-bold" data-testid="home-available-4">
        {amount}
      </span>
    </>
  );
  const cls =
    "flex items-center justify-between rounded-[16px] bg-emergency px-4 py-3.5 text-white no-underline";
  return state === "lockOff" || state === "empty" ? (
    <div className={cls}>{body}</div>
  ) : (
    <Link href="/app/emergency" className={cls}>
      {body}
    </Link>
  );
}
