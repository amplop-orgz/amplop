// Parent home (spec 14): the contract reads, and the alerts card built from indexer alerts, the open
// Emergency request, a pending removal and the computed low-envelope check. Never a shop or purchase.
"use client";
import { formatDay, formatDayTime, formatRelative, type Lang } from "@amplop/shared/dates";
import { EmergencyStatus, PendingKind } from "@amplop/shared/enums";
import { toBig, type AlertRow } from "@amplop/shared/indexer";
import { shopKind } from "@amplop/shared/mcc";
import { thisWeekShare, type Schedule } from "@amplop/shared/schedule";
import { useCallback } from "react";
import { read, type AccountInfo } from "./chain/client";
import type { EmergencyInfo } from "./emergency";
import type { EnvelopeView } from "./home";
import { useRead } from "./query";

export type ParentData = {
  totals: readonly bigint[];
  envelopes: readonly EnvelopeView[];
  nextReleaseDay: bigint;
  info: AccountInfo;
  clock: bigint;
  schedules: readonly Schedule[];
  em: EmergencyInfo;
  removal: { active: boolean; readyAt: bigint };
  decimals: number;
};

/** S14-2: one batch for account `T`, every 15 s while visible. */
export function useParentData(accountId: bigint | undefined) {
  const fetcher = useCallback(async (): Promise<ParentData> => {
    const id = accountId ?? 0n;
    const [totals, env, info, clock, schedules, em, removal, decimals] = await Promise.all([
      read<readonly bigint[]>("totals", [id]),
      read<readonly [readonly EnvelopeView[], bigint]>("envelopes", [id]),
      read<AccountInfo>("accountInfo", [id]),
      read<bigint>("clock", [id]),
      read<readonly Schedule[]>("schedules", [id]),
      read<EmergencyInfo>("emergency", [id]),
      read<readonly [boolean, bigint, `0x${string}`]>("pending", [id, PendingKind.TrustedRemoval]),
      read<number>("tokenDecimals"),
    ]);
    return {
      totals,
      envelopes: env[0],
      nextReleaseDay: env[1],
      info,
      clock,
      schedules,
      em,
      removal: { active: removal[0], readyAt: removal[1] },
      decimals,
    };
  }, [accountId]);
  return useRead(accountId === undefined ? null : `parent:${accountId.toString()}`, fetcher, {
    intervalMs: 15_000,
  });
}

export type AlertIcon = "lock" | "x" | "warn" | "arrows" | "sliders" | "person" | "key";
export type AlertTone = "amber" | "green" | "grey" | "red";

export type AlertLine = {
  key: string;
  /** For tests and 19: the R26 kind, or "low" for the computed alert. */
  kind: string;
  icon: AlertIcon;
  tone: AlertTone;
  title: string;
  sub: string;
  /** The open Emergency request links to its approval page (S14-12). */
  emergency?: boolean;
};

type T = (key: string, vars?: Record<string, string | number>) => string;

const WAIT = 48n * 3600n;

/**
 * S14-9 to S14-13: the open Emergency request first, then the contract's pending removal and the
 * indexer alerts newest first, then low-envelope alerts in envelope order.
 */
export function buildAlerts(o: {
  d: ParentData;
  alerts: readonly AlertRow[];
  name: string;
  t: T;
  lang: Lang;
  linkMissing: boolean;
}): AlertLine[] {
  const { d, name, t, lang } = o;
  const now = Number(d.clock);
  const when = (clock: bigint | number) => formatRelative(Number(clock), now, lang);
  const at = (clock: bigint | number) => formatDayTime(Number(clock), lang);
  const envName = (e: string | null) =>
    t(
      `envelope.${String(["Food", "Transport", "Study", "Everyday", "Emergency"].indexOf(e ?? ""))}`,
    );

  const out: AlertLine[] = [];
  const open = d.em.status === EmergencyStatus.Open;
  if (open) {
    out.push({
      key: `em-${d.em.requestSeq.toString()}`,
      kind: "EmergencyRequested",
      icon: "lock",
      tone: "amber",
      title: t("alert.emergency", { name }),
      sub: o.linkMissing
        ? t("alert.openLinkSent", { when: when(d.em.requestedAt), name })
        : t("alert.tapToAnswer", { when: when(d.em.requestedAt) }),
      emergency: true,
    });
  }

  const timed: { sort: number; line: AlertLine }[] = [];
  const indexerRemoval = o.alerts.some(
    (a) => a.kind === "TrustedRemovalStarted" && a.status === "Active",
  );
  if (d.removal.active && !indexerRemoval) {
    const started = d.removal.readyAt - WAIT;
    timed.push({
      sort: Number(started),
      line: {
        key: "removal-contract",
        kind: "TrustedRemovalStarted",
        icon: "person",
        tone: "amber",
        title: t("alert.removal", { name }),
        sub: t("alert.takesEffect", { when: when(started), at: at(d.removal.readyAt) }),
      },
    });
  }
  for (const a of o.alerts) {
    if (a.status === "Replaced") continue;
    if (
      open &&
      a.kind === "EmergencyRequested" &&
      a.requestSeq !== null &&
      toBig(a.requestSeq) === d.em.requestSeq
    )
      continue;
    const w = when(toBig(a.accountClock));
    const cancelled = a.status === "Cancelled";
    const ready = a.readyAt === null ? "" : at(toBig(a.readyAt));
    const base = { key: a.id, kind: a.kind };
    let line: AlertLine;
    switch (a.kind) {
      case "EmergencyRequested":
        line = {
          ...base,
          icon: "lock",
          tone: a.status === "Done" ? "green" : cancelled ? "grey" : "amber",
          title: t("alert.emergency", { name }),
          sub: t(
            a.status === "Done"
              ? "alert.opened"
              : cancelled
                ? "alert.cancelled"
                : "alert.tapToAnswer",
            { when: w },
          ),
        };
        break;
      case "PurchaseBlocked": {
        const kind = shopKind(a.shopType ?? 0);
        line = {
          ...base,
          icon: "x",
          tone: "red",
          title:
            kind.category === "other"
              ? t("alert.blockedOther")
              : t("alert.blocked", { category: kind.category }),
          sub: t("alert.noMoney", { when: w }),
        };
        break;
      }
      case "PurchaseMoved":
        line = {
          ...base,
          icon: "arrows",
          tone: "grey",
          title: t("alert.moved", {
            name,
            from: envName(a.fromEnvelope),
            to: envName(a.toEnvelope),
          }),
          sub: w,
        };
        break;
      case "SplitSaved":
        line = {
          ...base,
          icon: "sliders",
          tone: "grey",
          title: t("alert.split", { name }),
          sub: cancelled
            ? t("alert.cancelled", { when: w })
            : t("alert.starts", { when: w, at: ready }),
        };
        break;
      case "LockOffStarted":
        line = {
          ...base,
          icon: "lock",
          tone: "amber",
          title: t("alert.lockOff", { name }),
          sub: cancelled
            ? t("alert.cancelled", { when: w })
            : t("alert.takesEffect", { when: w, at: ready }),
        };
        break;
      case "TrustedRemovalStarted":
        line = {
          ...base,
          icon: "person",
          tone: "amber",
          title: t("alert.removal", { name }),
          sub: cancelled
            ? t("alert.cancelled", { when: w })
            : t("alert.takesEffect", { when: w, at: ready }),
        };
        break;
      case "RecoveryApproved":
        line = {
          ...base,
          icon: "key",
          tone: "amber",
          title: t("alert.recovery", { name }),
          sub: cancelled
            ? t("alert.cancelled", { when: w })
            : t("alert.moves", { when: w, at: ready }),
        };
        break;
    }
    timed.push({ sort: Number(toBig(a.accountClock)) + Number(toBig(a.sortKey)) / 1e13, line });
  }
  out.push(...timed.sort((a, b) => b.sort - a.sort).map((x) => x.line));
  out.push(...lowEnvelopeAlerts(d, t, lang));
  return out;
}

/** S14-11: under 20% of this week's share, from contract reads only; never stored. */
export function lowEnvelopeAlerts(d: ParentData, t: T, lang: Lang): AlertLine[] {
  const today = Number(d.clock / 86_400n);
  const out: AlertLine[] = [];
  for (let e = 0; e < 4; e++) {
    const share = thisWeekShare(d.schedules, today, e);
    const available = d.envelopes[e]?.available ?? 0n;
    if (share === 0n || available * 5n >= share) continue;
    const p = Number((available * 100n) / share);
    const envelope = t(`envelope.${String(e)}`);
    out.push({
      key: `low-${String(e)}`,
      kind: "low",
      icon: "warn",
      tone: "amber",
      title: p === 0 ? t("alert.lowEmpty", { envelope }) : t("alert.low", { envelope, p }),
      sub:
        d.nextReleaseDay > 0n
          ? t("home.nextReleaseDay", { day: formatDay(Number(d.nextReleaseDay) * 86_400, lang) })
          : t("home.noMoreShares"),
    });
  }
  return out;
}
