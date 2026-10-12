// Board 2.5 Simulated checkout (09 S09-5 to S09-8).
"use client";
import { formatUsd, shopAmountToUnits } from "@amplop/shared/money";
import { CreditCard, Info } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button, InlineMessage, Page, TopBar } from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { api, ApiError } from "@/lib/client/api";
import { useCard, useTokenDecimals } from "@/lib/client/card/hooks";
import { handOff, type AuthorizeResponse } from "@/lib/client/card/result";
import {
  CURRENCY_SIGN,
  groupTyped,
  minorToTyped,
  parseShopAmount,
  shopBySlug,
} from "@/lib/client/card/shops";
import { RATES } from "@/lib/client/env";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";

function newKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function Checkout() {
  const { t } = useT();
  const router = useRouter();
  const shop = shopBySlug(useSearchParams().get("shop"));
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const card = useCard(accountId);
  const decimals = useTokenDecimals();
  const fieldId = useId();
  // S09-7: one key for every tap and retry on this screen; a new one only after a final result.
  const key = useRef<string>(newKey());
  const [typed, setTyped] = useState(() =>
    shop ? minorToTyped(shop.defaultMinor, shop.currency) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; retry: boolean } | null>(null);

  useEffect(() => {
    if (!shop) router.replace("/app/card");
  }, [shop, router]);
  if (!shop || accountId === undefined) return null;

  const parsed = parseShopAmount(typed, shop.currency);
  const units =
    parsed.ok && decimals.data !== undefined
      ? shopAmountToUnits(shop.currency, parsed.minor, decimals.data, RATES)
      : null;

  const pay = async () => {
    if (!parsed.ok || !card.data) return;
    setBusy(true);
    setError(null);
    const body = {
      cardToken: card.data.cardToken,
      amount: parsed.minor.toString(),
      currency: shop.currency,
      merchantName: shop.merchantName,
      merchantCity: shop.city,
      mcc: String(shop.mcc).padStart(4, "0"),
      idempotencyKey: key.current,
    };
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await api.post<AuthorizeResponse>("/api/card/authorize", body, {
          auth: { action: "card.authorize", accountId },
        });
        handOff(r, {
          merchantName: shop.merchantName,
          merchantCity: shop.city,
          currency: shop.currency,
          amountMinor: parsed.minor,
          mcc: shop.mcc,
        });
        key.current = newKey();
        router.push(
          `/app/card/result/${r.purchaseId}?tx=${r.txHash}${r.confirmMs === null ? "" : `&ms=${String(r.confirmMs)}`}`,
        );
        return;
      } catch (e) {
        if (!(e instanceof ApiError)) {
          setError({ text: t(errorKey(e, hasKey) as Key), retry: true });
          break;
        }
        if (
          (e.code === "payment_unconfirmed" || e.code === "purchase_in_progress") &&
          attempt < 5
        ) {
          setError({ text: t("pay.stillChecking"), retry: false });
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        if (e.code === "not_owner") setError({ text: t("pay.notOwner"), retry: false });
        else if (e.code === "chain_unavailable" || e.code === "chain_busy")
          setError({ text: `${t("pay.nothingCharged")} ${e.message}`, retry: true });
        else setError({ text: e.status === 0 ? t("error.offline") : e.message, retry: true });
        break;
      }
    }
    setBusy(false);
  };

  return (
    <>
      <div className="flex items-center justify-between pr-5">
        <TopBar back="/app/card" title={t("pay.title")} />
        <span className="rounded-full border border-dashed border-input-border px-2.5 py-1 text-[0.8125rem] font-bold text-muted">
          {t("pay.simulation")}
        </span>
      </div>
      <Page className="gap-[18px]">
        <div className="flex items-start gap-2.5 rounded-[16px] bg-info-bg px-4 py-3.5 text-[0.875rem] text-info">
          <Info size={20} aria-hidden="true" className="shrink-0" />
          <div>{t("pay.text")}</div>
        </div>
        <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border">
          <div className="flex min-h-[52px] items-center justify-between gap-3 text-[0.9375rem]">
            <span className="text-muted">{t("pay.shop")}</span>
            <span className="font-bold">
              {shop.merchantName} · {shop.city}
            </span>
          </div>
          <div className="flex min-h-[52px] items-center justify-between gap-3 text-[0.9375rem]">
            <span className="text-muted">{t("pay.shopType")}</span>
            <span className="font-bold">{shop.typeLabel}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={fieldId} className="text-[0.875rem] font-bold">
            {t("pay.amount")}
          </label>
          <div className="flex h-16 items-center rounded-[12px] border border-input-border bg-card px-4">
            <span aria-hidden="true" className="amount text-[1.625rem] font-bold">
              {CURRENCY_SIGN[shop.currency]}
            </span>
            <input
              id={fieldId}
              inputMode={shop.currency === "IDR" ? "numeric" : "decimal"}
              value={typed}
              disabled={busy}
              onChange={(e) => {
                setTyped(groupTyped(e.target.value, shop.currency));
              }}
              aria-describedby={`${fieldId}-help`}
              className="amount min-w-0 flex-1 bg-transparent text-[1.625rem] font-bold text-ink outline-none"
            />
          </div>
          <div
            id={`${fieldId}-help`}
            aria-live="polite"
            className="amount text-[0.875rem] text-muted"
          >
            {!parsed.ok && parsed.reason === "precision"
              ? t("pay.decimals")
              : shop.currency !== "USD" && units !== null
                ? t("pay.about", { usd: formatUsd(units, decimals.data ?? 6) })
                : null}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-[0.875rem] font-bold">{t("pay.payingWith")}</div>
          <div className="flex items-center gap-3 rounded-[16px] bg-ink px-4 py-3 text-white">
            <CreditCard size={22} aria-hidden="true" />
            <div className="flex flex-col">
              <span className="text-[0.9375rem] font-bold">{t("pay.demoCard")}</span>
              <span className="amount text-[0.8125rem]">•••• {card.data?.last4 ?? "••••"}</span>
            </div>
          </div>
          <p className="m-0 text-[0.875rem] text-muted">{t("pay.info")}</p>
        </div>
        <div className="flex-1" />
        {error ? (
          <InlineMessage
            kind="error"
            onRetry={
              error.retry && !busy
                ? () => {
                    void pay();
                  }
                : undefined
            }
          >
            {error.text}
          </InlineMessage>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button
            disabled={!parsed.ok || !card.data || busy}
            busyLabel={busy ? t("pay.checking") : null}
            onClick={() => void pay()}
          >
            {t("pay.pay")}
          </Button>
          <p className="m-0 text-center text-[0.875rem] text-muted">{t("pay.soon")}</p>
        </div>
      </Page>
    </>
  );
}
