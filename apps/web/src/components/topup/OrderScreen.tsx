// Boards 1.3 Waiting for payment and 1.4 Allowance sent, one route per order (08 S08-7 to S08-10).
// Times here are real time: a bank's expiry does not move with Skip time.
"use client";
import { formatDue, formatTime } from "@amplop/shared/dates";
import { formatRupiah, formatUsd, weeklyShares } from "@amplop/shared/money";
import { shortName } from "@amplop/shared/names";
import { Copy, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hash } from "viem";
import { SimulatePaymentButton } from "@/components/demo/DemoControls";
import {
  Button,
  ButtonLink,
  InfoBox,
  InlineMessage,
  Page,
  ProofLink,
  ResultHeader,
  TopBar,
} from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { ApiError } from "@/lib/client/api";
import { useTokenDecimals } from "@/lib/client/card/hooks";
import { proofUrl } from "@/lib/client/chain/write";
import { useAccount, useProfileName } from "@/lib/client/data";
import { useT, type Key } from "@/lib/client/i18n";
import { useRead } from "@/lib/client/query";
import { copyText } from "@/lib/client/share";
import {
  depositFromTx,
  forgetOrder,
  getOrder,
  groupVa,
  isOpen,
  shownStatus,
  type OrderView,
} from "@/lib/client/topup";

const POLL_MS = 5_000;

/** S08-8: every 5 s while visible and open; at once when the tab comes back; never after a final state. */
function useOrder(orderId: string, accountId: bigint | undefined) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [problem, setProblem] = useState<"offline" | "poll" | "missing" | null>(null);
  const orderRef = useRef<OrderView | null>(null);
  const poll = useCallback(async () => {
    if (accountId === undefined) return;
    try {
      const o = await getOrder(orderId, accountId);
      orderRef.current = o;
      setOrder(o);
      setProblem(null);
      if (!isOpen(o.status)) forgetOrder(orderId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setProblem("missing");
      else setProblem(e instanceof ApiError && e.code === "offline" ? "offline" : "poll");
    }
  }, [orderId, accountId]);
  useEffect(() => {
    void poll();
    const live = () => !orderRef.current || isOpen(orderRef.current.status);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && live()) void poll();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && live()) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);
  const set = useCallback(
    (o: OrderView) => {
      orderRef.current = o;
      setOrder(o);
      if (!isOpen(o.status)) forgetOrder(orderId);
    },
    [orderId],
  );
  return { order, problem, poll, set };
}

export function OrderScreen() {
  const { t, lang } = useT();
  const orderId = useParams<{ order: string }>().order;
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.trustedAccountId : undefined;
  const profile = useProfileName(accountId);
  const { order, problem, poll, set } = useOrder(orderId, accountId);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const name = profile.data ? shortName(profile.data) : t("common.theStudent");

  if (accountId === undefined) return null;
  if (problem === "missing" || !/^[0-9a-f]{32}$/.test(orderId)) {
    return (
      <>
        <TopBar back="/app/parent" title={t("order.title")} />
        <Page>
          <p className="m-0">{t("order.notFound")}</p>
          <ButtonLink parent href="/app/parent">
            {t("order.backHome")}
          </ButtonLink>
        </Page>
      </>
    );
  }
  if (!order) {
    return problem ? (
      <div className="p-5">
        <InlineMessage kind="offline" onRetry={() => void poll()}>
          {t("error.offline")}
        </InlineMessage>
      </div>
    ) : (
      <div className="p-5 text-muted">{t("common.loading")}</div>
    );
  }

  const status = shownStatus(order, Date.now());
  const rupiah = formatRupiah(BigInt(order.rupiah));
  const again = `/app/parent/send?change=1&amount=${order.rupiah}`;
  if (status === "sent") return <Sent order={order} accountId={accountId} name={name} />;
  if (status === "expired" || status === "failed") {
    return (
      <>
        <TopBar back="/app/parent" title={t("send.title")} />
        <Page>
          <h1 className="m-0 text-[1.375rem] font-bold">
            {t(status === "expired" ? "order.expired" : "order.failed")}
          </h1>
          {status === "failed" ? (
            <p className="m-0 text-muted">{t("order.nothingDeposited")}</p>
          ) : null}
          <div className="flex-1" />
          <ButtonLink parent href={again}>
            {t("order.startAgain")}
          </ButtonLink>
        </Page>
      </>
    );
  }

  const checked = order.lastCheckedAt
    ? formatTime(Date.parse(order.lastCheckedAt) / 1000, lang)
    : "";
  const due = order.expiresAt
    ? formatDue(Date.parse(order.expiresAt) / 1000, Date.now() / 1000, lang)
    : "";
  const received = status === "received";
  return (
    <>
      <TopBar back="/app/parent" title={t("order.title")} />
      <Page>
        <div className="flex flex-col items-center gap-1 py-2 text-center">
          <div className="amount text-[2rem] leading-tight font-bold" data-testid="order-rupiah">
            {rupiah}
          </div>
          <div className="user-text text-muted">{t("order.for", { name })}</div>
        </div>
        <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border">
          {order.vaNumber ? (
            <Row label={t("order.va")}>
              <span className="amount flex items-center gap-1 font-bold" data-testid="order-va">
                {groupVa(order.vaNumber)}
                <button
                  type="button"
                  aria-label={t("order.copy")}
                  className="flex size-11 items-center justify-center text-link"
                  onClick={() => {
                    void copyText(order.vaNumber ?? "").then(() => {
                      setCopied(true);
                      setTimeout(() => {
                        setCopied(false);
                      }, 2_000);
                    });
                  }}
                >
                  <Copy size={18} aria-hidden="true" />
                </button>
              </span>
              {copied ? (
                <span role="status" className="text-[0.8125rem] text-ok">
                  {t("order.copied")}
                </span>
              ) : null}
            </Row>
          ) : null}
          {order.bank ? <Row label={t("order.bank")}>{order.bank.toUpperCase()}</Row> : null}
          {due ? <Row label={t("order.payBefore")}>{due}</Row> : null}
          <Row label={t("order.status")}>
            <span
              className="flex flex-col items-end gap-0.5 text-right"
              aria-live="polite"
              data-testid="order-status"
            >
              {received ? (
                <span className="user-text flex items-center gap-1.5 font-bold">
                  <Loader2 size={16} aria-hidden="true" className="animate-spin" />
                  {t("order.receivedSending", { name })}
                </span>
              ) : problem === "poll" ? (
                <span>{t("order.pollError", { time: checked })}</span>
              ) : (
                <span>{t("order.notYet", { time: checked })}</span>
              )}
              {problem === "offline" ? (
                <span className="text-[0.8125rem] text-danger">{t("order.offline")}</span>
              ) : null}
            </span>
          </Row>
        </div>
        {received ? null : (
          <>
            <InfoBox>{t("order.info", { name, time: due })}</InfoBox>
            <SimulatePaymentButton orderId={orderId} accountId={accountId} onDone={set} />
            <Button
              parent
              variant="secondary"
              busyLabel={checking ? t("order.checking") : null}
              onClick={() => {
                setChecking(true);
                void poll().finally(() => {
                  setChecking(false);
                });
              }}
            >
              {t("order.check")}
            </Button>
            <ButtonLink variant="text" parent href="/app/parent/send?change=1">
              {t("order.change")}
            </ButtonLink>
          </>
        )}
      </Page>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[56px] flex-wrap items-center justify-between gap-x-3 py-2">
      <span className="text-muted">{label}</span>
      {children}
    </div>
  );
}

/** Board 1.4: the parts come from the Deposited event in the deposit's receipt (PRD 5 "C: deposit"). */
function Sent({ order, accountId, name }: { order: OrderView; accountId: bigint; name: string }) {
  const { t } = useT();
  const decimals = useTokenDecimals();
  const account = useAccount(accountId);
  const tx = order.depositTx as Hash | undefined;
  const fetchDeposit = useCallback(() => (tx ? depositFromTx(tx) : Promise.resolve(null)), [tx]);
  const dep = useRead(tx ? `deposit:${tx}` : null, fetchDeposit);
  const d = decimals.data ?? 6;
  const usd = (u: bigint) => formatUsd(u, d);
  const dollars = BigInt(order.dollars);
  const parts = dep.data?.parts;
  const lockOn = account.data?.info.lockOn ?? true;
  return (
    <div className="flex min-h-dvh flex-1 flex-col gap-5 px-5 pt-12 pb-6">
      <ResultHeader ok title={t("sent.title")}>
        <p className="user-text amount m-0 max-w-[320px]">
          {t("sent.sentence", {
            rupiah: formatRupiah(BigInt(order.rupiah)),
            dollars: usd(dollars),
            name,
          })}
        </p>
      </ResultHeader>
      {parts ? (
        <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border">
          {parts.map((p, i) => (
            <div key={i} className="flex min-h-[56px] items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 flex-col gap-px">
                <div className="font-bold">{t(`envelope.${String(i)}` as Key)}</div>
                <div className="amount text-[0.8125rem] text-muted">
                  {i < 4
                    ? t("send.everyMonday", { amount: usd(weeklyShares(p)[0]) })
                    : lockOn
                      ? t("sent.locked")
                      : t("sent.wentToEveryday")}
                </div>
              </div>
              <div className="amount shrink-0 font-bold" data-testid={`sent-part-${String(i)}`}>
                {usd(p)}
              </div>
            </div>
          ))}
        </div>
      ) : dep.loading ? (
        <div className="text-muted">{t("common.loading")}</div>
      ) : null}
      <div className="flex flex-col gap-2 rounded-[16px] bg-quiet px-4 pt-3.5 pb-1">
        <div className="text-[0.875rem] font-bold text-muted">{t("result.detail")}</div>
        <div className="flex justify-between text-[0.875rem]">
          <span className="text-muted">{t("result.value")}</span>
          <span className="amount">{usd(dollars).slice(1)} AUSD</span>
        </div>
        {order.confirmMs !== undefined ? (
          <div className="flex justify-between text-[0.875rem]">
            <span className="text-muted">{t("result.confirmedIn")}</span>
            <span className="amount">
              {t("result.seconds", { n: (order.confirmMs / 1000).toFixed(1).replace(".", ",") })}
            </span>
          </div>
        ) : null}
        {tx ? <ProofLink href={proofUrl(tx)} what={t("sent.title")} /> : null}
      </div>
      <div className="flex-1" />
      <ButtonLink parent href="/app/parent">
        {t("order.backHome")}
      </ButtonLink>
    </div>
  );
}
