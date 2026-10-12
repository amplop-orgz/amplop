// Board 2.1 Allowance arrived (08 S08-11 to S08-13). The student never reads the parent's order: the
// Deposited event is the source, and the rupiah figure is recomputed at the sample rate.
"use client";
import { formatDay } from "@amplop/shared/dates";
import { formatRupiah, formatUsd, weeklyShares } from "@amplop/shared/money";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import type { Hash } from "viem";
import { ButtonLink, InlineMessage, ResultHeader } from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { useTokenDecimals } from "@/lib/client/card/hooks";
import { useTrustedName } from "@/lib/client/data";
import { useT, type Key } from "@/lib/client/i18n";
import { useRead } from "@/lib/client/query";
import { readJson, writeItem } from "@/lib/client/storage";
import { depositFromTx, recentDeposits, rupiahOf, type Deposit } from "@/lib/client/topup";

const SEEN_KEY = "amplop.seenDeposit";

function seen(): Record<string, string> {
  const raw = readJson("local", SEEN_KEY);
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, string>)
    : {};
}

/**
 * S08-13, for the student home: opens 2.1 once for the newest deposit. The indexer (16) comes first
 * once it exists; until then the latest 100 blocks.
 */
export function useArrivedDeposit(accountId: bigint | undefined): void {
  const router = useRouter();
  const fetcher = useCallback(async () => {
    const list = await recentDeposits({ accountId });
    return list.at(-1) ?? null;
  }, [accountId]);
  const newest = useRead(
    accountId === undefined ? null : `newest-deposit:${String(accountId)}`,
    fetcher,
    {
      intervalMs: 15_000,
    },
  );
  const dep = newest.data;
  useEffect(() => {
    if (!dep || accountId === undefined) return;
    const map = seen();
    const key = accountId.toString();
    if (map[key] === dep.paymentId) return;
    writeItem("local", SEEN_KEY, JSON.stringify({ ...map, [key]: dep.paymentId }));
    router.push(`/app/arrived/${dep.paymentId}?tx=${dep.txHash}`);
  }, [dep, accountId, router]);
}

export function Arrived() {
  const { t, lang } = useT();
  const paymentId = useParams<{ deposit: string }>().deposit;
  const tx = useSearchParams().get("tx");
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const trusted = useTrustedName(accountId);
  const decimals = useTokenDecimals();
  const valid = /^0x[0-9a-f]{64}$/.test(paymentId);
  const fetcher = useCallback(async (): Promise<Deposit | null> => {
    const id = paymentId as `0x${string}`;
    const fromTx = tx && /^0x[0-9a-f]{64}$/.test(tx) ? await depositFromTx(tx as Hash, id) : null;
    const found = fromTx ?? (await recentDeposits({ paymentId: id }))[0] ?? null;
    return found && found.accountId === accountId ? found : null;
  }, [paymentId, tx, accountId]);
  const dep = useRead(valid && accountId !== undefined ? `arrived:${paymentId}` : null, fetcher);

  if (accountId === undefined) return null;
  if (dep.error || decimals.error) {
    return (
      <div className="p-5">
        <InlineMessage
          kind="offline"
          onRetry={() => {
            dep.refetch();
            decimals.refetch();
          }}
        >
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  if (!valid || dep.data === null) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <p className="m-0">{t("arrived.notFound")}</p>
        <ButtonLink href="/app">{t("arrived.see")}</ButtonLink>
      </div>
    );
  }
  const d = decimals.data;
  const e = dep.data;
  if (!e || d === undefined) return <div className="p-5 text-muted">{t("common.loading")}</div>;
  const usd = (u: bigint) => formatUsd(u, d);
  const from = trusted ?? t("arrived.trustedPerson");
  return (
    <div className="flex min-h-dvh flex-1 flex-col gap-5 px-5 pt-12 pb-6">
      <ResultHeader ok title={t("arrived.title")} amount={usd(e.amount)}>
        <div className="user-text amount text-[0.875rem] text-muted">
          {t("arrived.from", {
            name: from,
            rupiah: formatRupiah(rupiahOf(e.amount, d)),
            date: formatDay(Number(e.startDay) * 86_400, lang),
          })}
        </div>
      </ResultHeader>
      <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border">
        <div className="flex justify-between py-2.5 text-[0.8125rem] font-bold text-muted">
          <span>{t("arrived.envelope")}</span>
          <span>{t("arrived.availableNow")}</span>
        </div>
        {e.parts.map((p, i) => {
          const first = i < 4 ? weeklyShares(p)[0] : 0n;
          return (
            <div key={i} className="flex min-h-[56px] items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 flex-col gap-px">
                <div className="font-bold">{t(`envelope.${String(i)}` as Key)}</div>
                <div className="amount text-[0.8125rem] text-muted">
                  {i < 4
                    ? t("arrived.moreWeekly", { amount: usd(p - first) })
                    : t("arrived.locked", { amount: usd(p) })}
                </div>
              </div>
              <div className="amount shrink-0 font-bold" data-testid={`arrived-now-${String(i)}`}>
                {usd(first)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex-1" />
      <ButtonLink href="/app">{t("arrived.see")}</ButtonLink>
    </div>
  );
}
