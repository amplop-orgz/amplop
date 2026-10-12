"use client";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { DemoCard } from "@/components/ui/DemoCard";
import { EnvelopeChip, InlineMessage, TabBar } from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { DEMO_SHOPS } from "@/lib/client/card/shops";
import { useCard } from "@/lib/client/card/hooks";
import { read } from "@/lib/client/chain/client";
import { useProfileName, useTrustedName } from "@/lib/client/data";
import { useT } from "@/lib/client/i18n";
import { useRead } from "@/lib/client/query";

const SHOWN = DEMO_SHOPS.filter((s) => s.onCardScreen);

// Board 2.4 Card (09 S09-1 to S09-4). Chips come live from the contract's shopEnvelope.
export default function CardPage() {
  const { t } = useT();
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const card = useCard(accountId);
  const name = useProfileName(accountId);
  const trusted = useTrustedName(accountId);
  const fetchChips = useCallback(
    () =>
      Promise.all(
        SHOWN.map((s) => read<readonly [number, boolean]>("shopEnvelope", [accountId, s.mcc])),
      ),
    [accountId],
  );
  const chips = useRead(accountId === undefined ? null : `chips:${String(accountId)}`, fetchChips);
  if (accountId === undefined) return null;
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-5 pt-5 pb-3">
        <h1 className="m-0 text-[1.25rem] font-bold">{t("card.title")}</h1>
        {card.error ? (
          <InlineMessage kind="error" onRetry={card.refetch}>
            {t("card.loadFailed")}
          </InlineMessage>
        ) : (
          <DemoCard name={name.data ?? ""} last4={card.data?.last4 ?? "••••"} />
        )}
        <p className="m-0 text-[0.875rem] text-muted">{t("card.text")}</p>
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-[0.875rem] font-bold text-muted">{t("card.try")}</h2>
          <div className="flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border">
            {SHOWN.map((s, i) => {
              const chip = chips.data?.[i];
              return (
                <Link
                  key={s.slug}
                  href={`/app/card/pay?shop=${s.slug}`}
                  className="flex min-h-14 items-center justify-between gap-3 text-ink no-underline"
                >
                  <span className="font-semibold">{s.label}</span>
                  <span className="flex items-center gap-2">
                    {chip ? <EnvelopeChip index={chip[0]} blocked={chip[1]} /> : null}
                    <ChevronRight size={18} aria-hidden="true" className="text-muted" />
                  </span>
                </Link>
              );
            })}
          </div>
          {trusted ? (
            <p className="user-text m-0 text-[0.8125rem] text-muted">
              {t("card.footer", { name: trusted })}
            </p>
          ) : null}
        </div>
      </div>
      <TabBar current="card" />
    </>
  );
}
