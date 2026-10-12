"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HomeEmpty } from "@/components/onboarding/HomeEmpty";
import { useArrivedDeposit } from "@/components/topup/Arrived";
import { Welcome } from "@/components/onboarding/Welcome";
import { Home } from "@/components/home/Home";
import { RecoveryBanner } from "@/components/settings/RecoveryBanner";
import { InlineMessage } from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { useAccount, useProfileName, useTrustedName } from "@/lib/client/data";
import { appHome } from "@/lib/client/guard";
import { useT } from "@/lib/client/i18n";

// /app: Welcome, the student's home, or parent home (06 S06-8, 07 S07-4, S07-19, S07-21).
export default function AppPage() {
  const { session, role } = useSession();
  const router = useRouter();
  const where = typeof role === "object" ? appHome(role) : undefined;
  useEffect(() => {
    if (where === "/app/parent") router.replace("/app/parent");
  }, [where, router]);
  if (!session || where === null) return <Welcome />;
  if (where === "home" && typeof role === "object" && role.studentAccountId !== undefined) {
    return <StudentHome accountId={role.studentAccountId} />;
  }
  return null;
}

function StudentHome({ accountId }: { accountId: bigint }) {
  const { t } = useT();
  const router = useRouter();
  const account = useAccount(accountId, { intervalMs: 10_000 });
  const profile = useProfileName(accountId);
  const trustedName = useTrustedName(accountId);
  useArrivedDeposit(accountId);
  useEffect(() => {
    // S07-4: an account with no saved name finishes on the name step.
    if (profile.data === null) router.replace("/app/name");
  }, [profile.data, router]);
  if (account.error || profile.error) {
    return (
      <div className="p-5">
        <InlineMessage
          kind="offline"
          onRetry={() => {
            account.refetch();
            profile.refetch();
          }}
        >
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  if (!account.data || !profile.data)
    return <div className="p-5 text-muted">{t("common.loading")}</div>;
  if (account.data.info.everDeposited)
    return (
      <Home
        accountId={accountId}
        name={profile.data}
        trustedName={trustedName}
        banner={<RecoveryBanner accountId={accountId} />}
      />
    );
  return <HomeEmpty account={account.data} name={profile.data} trustedName={trustedName} />;
}
