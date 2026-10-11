// Board 0.2b Your name (07 S07-12, S07-13). In account mode (an account with no saved name) Continue
// saves the name at once (S07-4).
"use client";
import { graphemeCount, normalizeName } from "@amplop/shared/names";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, InlineMessage, Page, TextField, TopBar } from "@/components/ui";
import { DemoCard } from "@/components/ui/DemoCard";
import { useSession } from "@/lib/client/account";
import { api } from "@/lib/client/api";
import { hasTrusted, useAccount, useProfileName } from "@/lib/client/data";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import { readDraft, writeDraft } from "@/lib/client/onboarding";
import { setProfileLabel } from "@/lib/client/profiles";
import { shortName } from "@amplop/shared/names";
import { ZERO_ADDRESS } from "@/lib/client/chain/client";

export function NameStep() {
  const { t } = useT();
  const router = useRouter();
  const { session, role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const profile = useProfileName(accountId);
  const account = useAccount(accountId);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  useEffect(() => {
    if (!session) return;
    const d = readDraft(session.credentialId);
    if (d.name) setValue(d.name);
  }, [session]);

  // S07-4: a student whose name is saved has nothing to do here.
  useEffect(() => {
    if (accountId !== undefined && typeof profile.data === "string") router.replace("/app");
  }, [accountId, profile.data, router]);

  if (!session) return null;
  const n = normalizeName(value);
  const problem =
    !n.ok && n.reason !== "empty"
      ? n.reason === "too_long"
        ? t("name.tooLong")
        : t("name.badChars")
      : null;
  const count = graphemeCount(value.trim());

  const next = () => {
    if (!n.ok) return;
    writeDraft(session.credentialId, { name: n.value });
    if (accountId === undefined) {
      router.push("/app/setup");
      return;
    }
    setBusy(true);
    setError(null);
    api
      .post(
        "/api/profile",
        { accountId: accountId.toString(), name: n.value },
        { auth: { action: "profile.save", accountId } },
      )
      .then(() => {
        setProfileLabel(session.credentialId, shortName(n.value));
        const a = account.data;
        const neverInvited = a && !hasTrusted(a) && a.invite.inviteKey === ZERO_ADDRESS;
        router.push(neverInvited ? "/app/invite" : "/app");
      })
      .catch((e: unknown) => {
        setBusy(false);
        setError(errorKey(e, hasKey) === "error.offline" ? "error.offline" : "name.notSaved");
      });
  };

  return (
    <>
      <TopBar back="/app" title={t("name.title")} />
      <Page className="gap-[18px]">
        <h2 className="m-0 text-[1.5rem] leading-tight font-bold">{t("name.heading")}</h2>
        <TextField
          label={t("name.label")}
          value={value}
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          onChange={(e) => {
            setValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") next();
          }}
          help={
            <>
              {count > 50 ? <span className="amount">{count}/60 · </span> : null}
              {t("name.help")}
            </>
          }
          error={problem}
        />
        <div className="flex flex-col gap-2">
          <div className="text-[0.875rem] font-bold text-muted">{t("name.onCard")}</div>
          <DemoCard name={value.trim()} last4="••••" />
        </div>
        <div className="flex-1" />
        {error ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}
        <Button disabled={!n.ok} busyLabel={busy ? t("name.saving") : null} onClick={next}>
          {t("common.continue")}
        </Button>
      </Page>
    </>
  );
}
