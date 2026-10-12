"use client";
import { formatUsd } from "@amplop/shared/money";
import { shortName } from "@amplop/shared/names";
import { useCallback } from "react";
import { ViewAsLink } from "@/components/demo/DemoControls";
import { ENVELOPE_BG, InlineMessage } from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { read } from "@/lib/client/chain/client";
import { useAccount, useProfileName } from "@/lib/client/data";
import { useT, type Key } from "@/lib/client/i18n";
import { useRead } from "@/lib/client/query";

// Where an accepted invite lands (10 B1). Spec 14 builds the full board 1.1 on this route.
export default function ParentPage() {
  const { t } = useT();
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.trustedAccountId : undefined;
  const account = useAccount(accountId);
  const profile = useProfileName(accountId);
  const fetchTotals = useCallback(async () => {
    const [totals, decimals] = await Promise.all([
      read<readonly bigint[]>("totals", [accountId]),
      read<number>("tokenDecimals"),
    ]);
    return { totals, decimals };
  }, [accountId]);
  const totals = useRead(
    accountId === undefined ? null : `totals:${String(accountId)}`,
    fetchTotals,
    { intervalMs: 10_000 },
  );
  if (accountId === undefined) return null;
  if (totals.error) {
    return (
      <div className="p-5">
        <InlineMessage kind="offline" onRetry={totals.refetch}>
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  const short = profile.data ? shortName(profile.data) : t("common.theStudent");
  return (
    <div className="flex flex-1 flex-col gap-3.5 px-5 pt-5 pb-6">
      <h1 className="user-text m-0 text-[1.375rem] font-bold">
        {t("parent.allowance", { short })}
      </h1>
      {totals.data && account.data ? (
        <div className="flex flex-col gap-2.5">
          {totals.data.totals.map((v, i) => (
            <div
              key={i}
              className={`flex min-h-14 items-center justify-between rounded-[16px] px-4 text-white ${ENVELOPE_BG[i] ?? ""}`}
            >
              <div className="font-bold">{t(`envelope.${String(i)}` as Key)}</div>
              <div className="amount font-bold" data-testid={`parent-total-${String(i)}`}>
                {formatUsd(v, totals.data?.decimals ?? 6)}
                {i === 4 && account.data?.info.lockOn ? ` · ${t("parent.locked")}` : ""}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-muted">{t("common.loading")}</div>
      )}
      <ViewAsLink name={short} />
    </div>
  );
}
