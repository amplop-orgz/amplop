// Board 1.1 Parent home (spec 14): five totals from the contract and the notifications card. The
// parent never sees a shop, a shop city, a purchase amount or a purchase id (J5, R25, R27).
"use client";
import { formatMonthYear } from "@amplop/shared/dates";
import { AlertsForTrustedQuery, type AlertsForTrustedResult } from "@amplop/shared/indexer";
import { formatRupiahCompact, formatRupiahRounded, formatUsd } from "@amplop/shared/money";
import { shortName } from "@amplop/shared/names";
import { dayOf, weekCounter } from "@amplop/shared/schedule";
import {
  ArrowLeftRight,
  CircleAlert,
  CircleX,
  KeyRound,
  Lock,
  SlidersHorizontal,
  UserMinus,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { ViewAsLink } from "@/components/demo/DemoControls";
import { Button, ButtonLink, ENVELOPE_BG, InlineMessage } from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { api } from "@/lib/client/api";
import { useProfileName } from "@/lib/client/data";
import { EmergencyStatus } from "@amplop/shared/enums";
import { useT, type Key } from "@/lib/client/i18n";
import { gql, useIndexerBehind } from "@/lib/client/indexer";
import {
  buildAlerts,
  useParentData,
  type AlertIcon,
  type AlertLine,
  type AlertTone,
} from "@/lib/client/parent";
import { useRead } from "@/lib/client/query";
import { rupiahOf } from "@/lib/client/topup";

const ICON: Record<AlertIcon, typeof Lock> = {
  lock: Lock,
  x: CircleX,
  warn: CircleAlert,
  arrows: ArrowLeftRight,
  sliders: SlidersHorizontal,
  person: UserMinus,
  key: KeyRound,
};
const TONE: Record<AlertTone, string> = {
  amber: "bg-wait-bg text-wait",
  green: "bg-ok-bg text-ok",
  grey: "bg-quiet text-muted",
  red: "bg-bad-bg text-bad",
};

/** S14-6: "About Rp10,9 million in total at the sample rate." and the rounded figure under it. */
export function rupiahTotal(totals: readonly bigint[], decimals: number, lang: "en" | "id") {
  const rupiah = rupiahOf(
    totals.reduce((s, x) => s + x, 0n),
    decimals,
  );
  return { compact: formatRupiahCompact(rupiah, lang), rounded: formatRupiahRounded(rupiah) };
}

export function ParentHome() {
  const { t } = useT();
  const { session, role } = useSession();
  const accountId = typeof role === "object" ? role.trustedAccountId : undefined;
  if (typeof role !== "object" || !session) return null;
  // S14-1, J6: not linked: no reads for any student, no profile call, no indexer query.
  if (accountId === undefined) {
    return (
      <div className="flex flex-1 flex-col gap-3 px-5 pt-8 pb-6">
        <h1 className="m-0 text-[1.375rem] font-bold">{t("parent.notLinked")}</h1>
        <p className="m-0 text-muted">{t("parent.notLinkedBody")}</p>
      </div>
    );
  }
  return <Linked accountId={accountId} address={session.address.toLowerCase()} />;
}

function Linked({ accountId, address }: { accountId: bigint; address: string }) {
  const { t, lang } = useT();
  const data = useParentData(accountId);
  const profile = useProfileName(accountId);
  const behind = useIndexerBehind();
  const [shown, setShown] = useState(5);
  const limit = Math.max(20, shown);
  const fetchAlerts = useCallback(
    () =>
      gql<AlertsForTrustedResult>(AlertsForTrustedQuery, {
        accountId: accountId.toString(),
        trusted: address,
        limit,
      }),
    [accountId, address, limit],
  );
  const alerts = useRead(
    `alerts:${address}:${accountId.toString()}:${String(limit)}`,
    fetchAlerts,
    {
      intervalMs: 30_000,
    },
  );
  const open = data.data?.em.status === EmergencyStatus.Open;
  const seq = data.data?.em.requestSeq;
  const fetchLink = useCallback(async () => {
    try {
      const r = await api.get<{ linkId: string; requestSeq: string }>("/api/reason/current", {
        auth: { action: "reason.current", accountId },
      });
      return r.requestSeq === String(seq) ? r.linkId : null;
    } catch {
      return null;
    }
  }, [accountId, seq]);
  const link = useRead(
    open ? `parent-link:${accountId.toString()}:${String(seq)}` : null,
    fetchLink,
  );

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
  if (!d || profile.loading) return <div className="p-5 text-muted">{t("common.loading")}</div>;
  const name = profile.data ? shortName(profile.data) : t("parent.yourStudent");
  const usd = (u: bigint) => formatUsd(u, d.decimals);
  const week = weekCounter(d.schedules, dayOf(d.clock));
  const month = formatMonthYear(Number(d.clock), lang);
  const lines = buildAlerts({
    d,
    alerts: alerts.data?.Alert ?? [],
    name,
    t: (k, v) => t(k as Key, v),
    lang,
    linkMissing: open && link.data === null,
  });
  const visible = lines.slice(0, shown);
  const r = rupiahTotal(d.totals, d.decimals, lang);

  return (
    <div className="flex flex-1 flex-col gap-3.5 px-5 pt-5 pb-6">
      <div className="flex flex-col gap-0.5">
        <h1 className="user-text m-0 text-[1.375rem] font-bold">
          {t("parent.allowance", { short: name })}
        </h1>
        <div className="text-muted">{week ? t("parent.monthWeek", { month, week }) : month}</div>
      </div>

      <section className="flex flex-col rounded-[16px] border border-border bg-card px-4 py-3">
        <h2 className="m-0 pb-1 text-[1rem] font-bold">{t("parent.notifications")}</h2>
        {visible.length === 0 ? (
          <p className="m-0 py-3 text-muted">{t("parent.noNotifications")}</p>
        ) : (
          <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-border">
            {visible.map((a) => (
              <AlertRowView
                key={a.key}
                a={a}
                href={a.emergency && link.data ? `/approve/${link.data}` : undefined}
              />
            ))}
          </div>
        )}
        {behind || alerts.error ? (
          <p className="m-0 pt-2 text-[0.875rem] text-muted">{t("parent.catchingUp")}</p>
        ) : null}
        {lines.length > shown ? (
          <Button
            variant="text"
            parent
            onClick={() => {
              setShown((n) => n + 20);
            }}
          >
            {t("activity.older")}
          </Button>
        ) : null}
      </section>

      {d.info.everDeposited ? null : (
        <section className="flex flex-col gap-2 rounded-[16px] border border-border bg-card p-4">
          <h2 className="m-0 text-[1rem] font-bold">{t("home.noAllowance")}</h2>
          <p className="user-text m-0 text-muted">{t("parent.firstBody", { name })}</p>
          <ButtonLink parent href="/app/parent/send">
            {t("parent.sendFirst")}
          </ButtonLink>
        </section>
      )}

      <section className="flex flex-col rounded-[16px] border border-border bg-card px-4 py-3">
        <h2 className="m-0 pb-1 text-[1rem] font-bold">{t("parent.leftIn")}</h2>
        <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-border">
          {d.totals.map((v, i) => (
            <div key={i} className="flex min-h-14 items-center justify-between gap-3">
              <span className="flex items-center gap-2.5">
                <span
                  className={`size-3 rounded-[3px] ${ENVELOPE_BG[i] ?? ""}`}
                  aria-hidden="true"
                />
                {t(`envelope.${String(i)}` as Key)}
                {i === 4 && d.info.lockOn ? (
                  <Lock size={16} aria-label={t("parent.locked")} />
                ) : null}
              </span>
              <span className="amount font-bold" data-testid={`parent-total-${String(i)}`}>
                {usd(v)}
              </span>
            </div>
          ))}
        </div>
        <p className="amount m-0 pt-2 text-[0.875rem]">
          {t("parent.aboutTotal", { rupiah: r.compact })}
        </p>
        <p className="amount m-0 text-[0.875rem] text-muted">{r.rounded}</p>
        <p className="user-text m-0 pt-2 text-[0.875rem] text-muted">
          {t("parent.onlySees", { name })}
        </p>
      </section>

      <ButtonLink parent href="/app/parent/send">
        {t("parent.send")}
      </ButtonLink>
      <ViewAsLink name={name} />
    </div>
  );
}

function AlertRowView({ a, href }: { a: AlertLine; href?: string }) {
  const Icon = ICON[a.icon];
  const body = (
    <>
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${TONE[a.tone]}`}
      >
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="user-text font-bold">{a.title}</span>
        <span className="user-text text-[0.875rem] text-muted">{a.sub}</span>
      </span>
    </>
  );
  const cls = "flex min-h-[60px] items-center gap-3 py-2 text-ink no-underline";
  return href ? (
    <Link href={href} className={cls} data-alert-kind={a.kind}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-alert-kind={a.kind}>
      {body}
    </div>
  );
}
