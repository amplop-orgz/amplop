// Boards 0.6 and 0.7, the home before the first allowance (07 S07-19 to S07-22).
"use client";
import { formatPercent, formatUsd } from "@amplop/shared/money";
import { shortName } from "@amplop/shared/names";
import { BookOpen, Lock, Settings, Share, ShoppingBag, TramFront, Utensils } from "lucide-react";
import Link from "next/link";
import { ButtonLink, ENVELOPE_BG, Guilloche, TabBar } from "@/components/ui";
import { hasTrusted, inviteOpen, type AccountData } from "@/lib/client/data";
import { useT, type Key } from "@/lib/client/i18n";
import { whatsappUrl } from "@/lib/client/share";

const ICONS = [Utensils, TramFront, BookOpen, ShoppingBag, Lock];

export type HomeState = "linked" | "invited" | "nobody";

export function homeState(a: AccountData): HomeState {
  if (hasTrusted(a)) return "linked";
  return inviteOpen(a) ? "invited" : "nobody";
}

export function HomeEmpty({
  account,
  name,
  trustedName,
}: {
  account: AccountData;
  name: string;
  trustedName: string | null;
}) {
  const { t } = useT();
  const origin = typeof location === "undefined" ? "" : location.origin;
  const state = homeState(account);
  const T = trustedName ?? t("common.yourTrustedPerson");
  const split = account.info.split;
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="user-text m-0 text-[1.25rem] font-bold">
              {t("home.hi", { name: shortName(name) })}
            </h1>
            <div className="text-[0.875rem] text-muted">{t("home.noAllowance")}</div>
          </div>
          <Link
            href="/app/settings"
            aria-label={t("common.settings")}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-ink"
          >
            <Settings size={20} aria-hidden="true" />
          </Link>
        </div>

        <div className="flex flex-col gap-1.5 rounded-[16px] border border-border bg-card p-4">
          <div className="font-bold">{t("home.waitingTitle")}</div>
          <div className="user-text text-[0.875rem] text-muted">
            {state === "linked"
              ? t("home.linked", { name: T })
              : state === "invited"
                ? t("home.invited", { name: T })
                : t("home.nobody")}
          </div>
          {state === "linked" ? (
            <ButtonLink
              variant="secondary"
              className="mt-2 min-h-11 text-[0.9375rem]"
              href={whatsappUrl(
                t("home.topUpText", { name: T, url: `${origin}/app/parent/send` }),
                { secret: false },
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Share size={18} aria-hidden="true" />
              <span className="user-text">{t("home.sendTopUp", { name: T })}</span>
            </ButtonLink>
          ) : state === "invited" ? (
            <ButtonLink
              variant="secondary"
              className="mt-2 min-h-11 text-[0.9375rem]"
              href="/app/invite"
            >
              {t("home.newInvite")}
            </ButtonLink>
          ) : (
            <ButtonLink className="mt-2" href="/app/invite">
              {t("home.invite")}
            </ButtonLink>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          {split.map((pct, i) => {
            const Icon = ICONS[i] ?? Lock;
            const share =
              i === 4 && account.info.lockOn
                ? t("home.locked", { pct: formatPercent(pct) })
                : i === 0
                  ? t("home.ofEach", { pct: formatPercent(pct) })
                  : formatPercent(pct);
            return (
              <div
                key={i}
                className={`relative flex min-h-16 items-center justify-between gap-3 overflow-hidden rounded-[16px] px-4 py-2 text-white ${ENVELOPE_BG[i] ?? ""}`}
              >
                <Guilloche />
                <div className="relative flex items-center gap-2.5">
                  <Icon size={20} aria-hidden="true" />
                  <div className="font-bold">{t(`envelope.${String(i)}` as Key)}</div>
                </div>
                <div className="relative flex flex-col items-end">
                  <div className="amount font-bold" data-testid={`envelope-available-${String(i)}`}>
                    {formatUsd(0n, 6) /* $0,00 in any decimals */}
                  </div>
                  <div className="amount text-[0.8125rem] font-semibold">{share}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <TabBar current="envelopes" />
    </>
  );
}
