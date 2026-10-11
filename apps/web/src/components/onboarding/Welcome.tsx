// Board 0.2 Welcome (07 S07-7 to S07-11).
"use client";
import { Clock, KeyRound, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, InlineMessage, LanguageToggle } from "@/components/ui";
import { Logo } from "@/components/ui/Logo";
import {
  checkPasskeySupport,
  createPasskeyAccount,
  signInWithPasskey,
  signOut,
  useSession,
  wasCreatedHere,
} from "@/lib/client/account";
import { ensureFunded } from "@/lib/client/chain/write";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import { readDraft, setFunding } from "@/lib/client/onboarding";

export function Welcome() {
  const { t } = useT();
  const router = useRouter();
  const { session } = useSession();
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState<"create" | "signin" | null>(null);
  const [error, setError] = useState<Key | null>(null);

  useEffect(() => {
    void checkPasskeySupport().then((r) => {
      setSupported(r.ok);
    });
  }, []);

  const fail = (e: unknown) => {
    setBusy(null);
    setError(errorKey(e, hasKey) as Key);
  };

  const create = () => {
    setBusy("create");
    setError(null);
    createPasskeyAccount("student").then((s) => {
      // S07-1 step 2: start the fee top-up at once; navigation does not wait for it.
      setFunding(s.credentialId, ensureFunded(s.address));
      router.push("/app/name");
    }, fail);
  };

  const signIn = () => {
    setBusy("signin");
    setError(null);
    // The guard on /app sends a student home and a trusted person to parent home.
    signInWithPasskey().then(() => {
      setBusy(null);
    }, fail);
  };

  return (
    <div className="flex min-h-dvh flex-1 flex-col gap-[22px] px-5 pt-5 pb-6">
      <div className="flex items-center justify-between">
        <Logo height={28} />
        <LanguageToggle />
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        <h1 className="m-0 text-[1.875rem] leading-tight font-bold tracking-[-0.01em]">
          {t("welcome.heading")}
        </h1>
        <p className="m-0 text-muted">{t("welcome.line")}</p>
      </div>
      <div className="flex flex-col gap-2.5">
        {(
          [
            ["bg-food", Mail, "welcome.tile1"],
            ["bg-transport", Clock, "welcome.tile2"],
            ["bg-emergency", Lock, "welcome.tile3"],
          ] as const
        ).map(([bg, Icon, k]) => (
          <div
            key={k}
            className={`flex items-center gap-3 rounded-[16px] px-4 py-3.5 text-white ${bg}`}
          >
            <Icon size={20} aria-hidden="true" className="shrink-0" />
            <div className="text-[0.9375rem] font-semibold">{t(k)}</div>
          </div>
        ))}
      </div>
      <div className="flex-1" />
      {session ? (
        <NoAccountCard />
      ) : (
        <div className="flex flex-col gap-2.5">
          {error ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}
          <Button
            disabled={!supported || busy !== null}
            busyLabel={busy === "create" ? t("welcome.creating") : null}
            onClick={create}
          >
            <KeyRound size={18} aria-hidden="true" />
            {t("welcome.create")}
          </Button>
          <div className="text-center text-[0.8125rem] text-muted">{t("welcome.createHelp")}</div>
          <Button
            variant="secondary"
            disabled={!supported || busy !== null}
            busyLabel={busy === "signin" ? t("welcome.signingIn") : null}
            onClick={signIn}
          >
            {t("welcome.signIn")}
          </Button>
          {!supported ? (
            <p role="alert" className="m-0 text-[0.875rem] text-danger">
              {t("welcome.unsupported")}
            </p>
          ) : null}
          <div className="mt-1 text-center text-[0.8125rem] text-muted">{t("welcome.invited")}</div>
          <Link
            href="/recover"
            className="flex min-h-11 items-center justify-center text-[0.875rem] font-bold text-link no-underline"
          >
            {t("welcome.lost")}
          </Link>
        </div>
      )}
    </div>
  );
}

/** S07-9: a session whose passkey has no account. */
function NoAccountCard() {
  const { t } = useT();
  const router = useRouter();
  const { session } = useSession();
  const [error, setError] = useState<Key | null>(null);
  if (!session) return null;
  const draft = readDraft(session.credentialId);
  const finishing = Boolean(draft.name) || wasCreatedHere(session.credentialId);
  const other = () => {
    signOut();
    signInWithPasskey().catch((e: unknown) => {
      setError(errorKey(e, hasKey) as Key);
    });
  };
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-border bg-card p-4">
      <div className="text-[1rem] font-bold">
        {t(finishing ? "welcome.finishTitle" : "welcome.noAccountTitle")}
      </div>
      <div className="text-[0.875rem] text-muted">
        {t(finishing ? "welcome.finishLine" : "welcome.noAccountLine")}
      </div>
      {error ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}
      <Button
        onClick={() => {
          router.push(draft.name ? "/app/setup" : "/app/name");
        }}
      >
        {t(finishing ? "common.continue" : "welcome.setUpNew")}
      </Button>
      <Button variant="text" onClick={other}>
        {t("welcome.differentPasskey")}
      </Button>
    </div>
  );
}
