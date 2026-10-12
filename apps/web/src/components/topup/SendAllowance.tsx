// Board 1.2 Send allowance (08 S08-2 to S08-6). The preview uses the sample rate; the server's own
// rate decides the real amount and locks it on the order.
"use client";
import { formatDayTime, formatTime } from "@amplop/shared/dates";
import {
  formatRupiah,
  formatUsd,
  rupiahToUnits,
  splitParts,
  weeklyShares,
} from "@amplop/shared/money";
import { shortName } from "@amplop/shared/names";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button, InlineMessage, Page, TopBar } from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { api, ApiError } from "@/lib/client/api";
import { useTokenDecimals } from "@/lib/client/card/hooks";
import { useAccount, useProfileName } from "@/lib/client/data";
import { RATES } from "@/lib/client/env";
import { useT, type Key } from "@/lib/client/i18n";
import {
  amountProblem,
  digitsOnly,
  lastAmount,
  rememberOrder,
  splitInForce,
  useOpenOrders,
} from "@/lib/client/topup";

export function SendAllowance() {
  const { t, lang } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const change = params.get("change") === "1";
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.trustedAccountId : undefined;
  const account = useAccount(accountId);
  const profile = useProfileName(accountId);
  const decimals = useTokenDecimals();
  const open = useOpenOrders(accountId);
  const inputId = useId();
  const [digits, setDigits] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accountId === undefined || digits !== null) return;
    const fromQuery = digitsOnly(params.get("amount") ?? "");
    setDigits(fromQuery || lastAmount(accountId).toString());
  }, [accountId, digits, params]);

  // S08-6, C3: reopening with exactly one open order returns to it.
  const only = open.data?.length === 1 ? open.data[0] : undefined;
  useEffect(() => {
    if (!change && only) router.replace(`/app/parent/send/${only.entry.orderId}`);
  }, [change, only, router]);

  if (accountId === undefined) return null;
  if (account.error || decimals.error) {
    return (
      <div className="p-5">
        <InlineMessage
          kind="offline"
          onRetry={() => {
            account.refetch();
            decimals.refetch();
          }}
        >
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  const name = profile.data ? shortName(profile.data) : t("common.theStudent");
  const d = decimals.data;
  const a = account.data;
  if (!a || d === undefined || digits === null || (!change && only))
    return <div className="p-5 text-muted">{t("common.loading")}</div>;

  const problem = amountProblem(digits);
  const rupiah = digits ? BigInt(digits) : 0n;
  const units = rupiahToUnits(rupiah, d, RATES.idrPerUsd);
  const split = splitInForce(a.info, a.clock);
  const parts = splitParts(units, split);
  const usd = (u: bigint) => formatUsd(u, d);

  const submit = () => {
    setBusy(true);
    setError(null);
    api
      .post<{ orderId: string }>(
        "/api/topup",
        { accountId: accountId.toString(), rupiah: digits },
        { auth: { action: "topup.create", accountId } },
      )
      .then((r) => {
        rememberOrder({
          accountId: accountId.toString(),
          orderId: r.orderId,
          rupiah: digits,
          createdAt: Date.now(),
        });
        router.push(`/app/parent/send/${r.orderId}`);
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : t("error.generic"));
        setBusy(false);
      });
  };

  return (
    <>
      <TopBar back="/app/parent" title={t("send.title")} />
      <Page>
        {(open.data ?? []).map(({ entry, order }) => {
          const due = order.expiresAt ? Date.parse(order.expiresAt) / 1000 : null;
          const sameDay =
            due !== null && new Date(due * 1000).toDateString() === new Date().toDateString();
          return (
            <div
              key={entry.orderId}
              className="flex items-center justify-between gap-3 rounded-[16px] bg-wait-bg px-4 py-3 text-[0.875rem] text-wait"
            >
              <span className="amount">
                {t("send.openLine", {
                  amount: formatRupiah(BigInt(order.rupiah)),
                  due:
                    due === null ? "" : sameDay ? formatTime(due, lang) : formatDayTime(due, lang),
                })}
              </span>
              <Link
                href={`/app/parent/send/${entry.orderId}`}
                className="shrink-0 font-bold text-link"
              >
                {t("send.open")}
              </Link>
            </div>
          );
        })}
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="user-text text-[0.875rem] font-bold">
            {t("send.amountFor", { name })}
          </label>
          <input
            id={inputId}
            inputMode="numeric"
            autoComplete="off"
            value={digits ? formatRupiah(rupiah) : ""}
            placeholder="Rp0"
            aria-describedby={`${inputId}-help`}
            aria-invalid={problem === "below" || problem === "above" ? true : undefined}
            onChange={(e) => {
              setDigits(digitsOnly(e.target.value));
            }}
            className="amount h-14 w-full rounded-[12px] border border-input-border bg-card px-4 text-[1.375rem] font-bold text-ink"
          />
          <div id={`${inputId}-help`} aria-live="polite" className="text-[0.875rem] text-danger">
            {problem === "below" ? t("send.min") : problem === "above" ? t("send.max") : null}
          </div>
        </div>
        <div className="flex flex-col gap-1 rounded-[16px] border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between font-bold">
            <span className="user-text">{t("send.receives", { name })}</span>
            <span className="amount" data-testid="send-receives">
              {usd(units)}
            </span>
          </div>
          <div className="amount text-[0.875rem] text-muted">
            {t("send.rate", { rate: formatRupiah(RATES.idrPerUsd) })}
          </div>
          <div className="amount text-[0.875rem] text-muted">{t("send.fee")}</div>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="user-text m-0 text-[0.875rem] font-bold text-muted">
            {t("send.splitHeading", { name })}
          </h2>
          <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border">
            {parts.map((p, i) => (
              <div key={i} className="flex min-h-[60px] items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 flex-col gap-px">
                  <div className="font-bold">
                    {t(`envelope.${String(i)}` as Key)} · {split[i] ?? 0}%
                  </div>
                  <div className="user-text amount text-[0.8125rem] text-muted">
                    {i < 4
                      ? t("send.everyMonday", { amount: usd(weeklyShares(p)[0]) })
                      : a.info.lockOn
                        ? t("send.lockedOpen", { name })
                        : t("send.lockOff")}
                  </div>
                </div>
                <div className="amount shrink-0 font-bold" data-testid={`send-part-${String(i)}`}>
                  {usd(p)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1" />
        <Button
          parent
          disabled={problem !== null || busy}
          busyLabel={busy ? t("send.creating") : null}
          onClick={submit}
        >
          {t("send.continue", { amount: formatRupiah(rupiah) })}
        </Button>
        {error ? (
          <InlineMessage kind="error" onRetry={submit}>
            {error}
          </InlineMessage>
        ) : null}
        <p className="m-0 text-center text-[0.8125rem] text-muted">{t("send.footnote")}</p>
      </Page>
    </>
  );
}
