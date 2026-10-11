"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TrustedPersonRow } from "@/components/trusted/TrustedPersonRow";
import { Button, InfoBox, ListCard, Page, TopBar } from "@/components/ui";
import { signOut, useSession } from "@/lib/client/account";
import { useAccount } from "@/lib/client/data";
import { useT, type Key } from "@/lib/client/i18n";

// The parts of board 4.1 this batch needs: the trusted-person row (10), split editing before the
// first allowance (07) and sign out (07 A2). Spec 13 builds the full Settings screen.
export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const { t } = useT();
  const router = useRouter();
  const saved = useSearchParams().get("saved");
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const account = useAccount(accountId);
  if (accountId === undefined) return null;
  const split = account.data?.info.split ?? [];
  return (
    <>
      <TopBar back="/app" title={t("settings.title")} />
      <Page className="gap-3">
        {saved ? (
          <InfoBox>{t(saved === "later" ? "setup.savedLater" : "setup.saved")}</InfoBox>
        ) : null}
        <ListCard>
          <TrustedPersonRow accountId={accountId} />
          <div className="flex min-h-[60px] items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 flex-col gap-px">
              <div className="font-bold">{t("settings.split")}</div>
              <div className="text-[0.8125rem] text-muted">
                {split.map((v, i) => (
                  <span key={i} className="whitespace-nowrap">
                    {i > 0 ? " · " : ""}
                    {t(`envelope.${String(i)}` as Key)} {v}
                  </span>
                ))}
              </div>
            </div>
            <Link
              href="/app/setup?edit=1"
              className="flex h-11 shrink-0 items-center text-[0.9375rem] font-bold text-link no-underline"
            >
              {t("settings.edit")}
            </Link>
          </div>
        </ListCard>
        <div className="flex-1" />
        <Button
          variant="danger"
          onClick={() => {
            signOut();
            router.replace("/app");
          }}
        >
          {t("settings.signOut")}
        </Button>
      </Page>
    </>
  );
}
