// 13 S13-22: the one pending change the home screen shows, in the recovery card's red tint.
"use client";
import { formatDayTime } from "@amplop/shared/dates";
import { PendingKind } from "@amplop/shared/enums";
import Link from "next/link";
import { useT } from "@/lib/client/i18n";
import { useSettingsData } from "@/lib/client/settings";

export function RecoveryBanner({ accountId }: { accountId: bigint }) {
  const { t, lang } = useT();
  const data = useSettingsData(accountId);
  const p = data.data?.pending[PendingKind.Recovery];
  if (!p?.active) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-[16px] bg-[#FFE7E4] px-4 py-3 text-[0.875rem]">
      <span className="text-[#A51F1E]">
        {t("home.recoveryBanner", { at: formatDayTime(Number(p.readyAt), lang) })}
      </span>
      <Link href="/app/settings" className="shrink-0 font-bold text-link">
        {t("home.review")}
      </Link>
    </div>
  );
}
