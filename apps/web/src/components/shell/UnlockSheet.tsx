// The unlock sheet (06 S06-10): the route stays, a sheet covers it, and a tap starts the passkey prompt.
"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, InlineMessage } from "@/components/ui";
import { Logo } from "@/components/ui/Logo";
import { signInWithPasskey } from "@/lib/client/account";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import { lastProfileId } from "@/lib/client/profiles";

export function UnlockSheet() {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const last = lastProfileId();
  const signIn = (credentialId?: string) => {
    setBusy(true);
    setError(null);
    signInWithPasskey(credentialId ? { credentialId } : {}).then(
      () => {
        setBusy(false);
      },
      (e: unknown) => {
        setBusy(false);
        setError(errorKey(e, hasKey) as Key);
      },
    );
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unlock-title"
      className="flex flex-1 flex-col gap-5 px-5 pt-12 pb-6"
    >
      <Logo height={28} />
      <div className="flex flex-col gap-2">
        <h1 id="unlock-title" className="m-0 text-[1.625rem] font-bold">
          {t("unlock.title")}
        </h1>
        <p className="m-0 text-muted">{t("unlock.line")}</p>
      </div>
      <div className="flex-1" />
      {error ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}
      <div className="flex flex-col gap-2">
        <Button
          busyLabel={busy ? t("unlock.signingIn") : null}
          onClick={() => {
            signIn(last ?? undefined);
          }}
        >
          {t("unlock.signIn")}
        </Button>
        {last ? (
          <Button
            variant="text"
            disabled={busy}
            onClick={() => {
              signIn();
            }}
          >
            {t("unlock.another")}
          </Button>
        ) : null}
        <Link
          href="/app?start"
          className="flex min-h-12 items-center justify-center font-bold text-link no-underline"
        >
          {t("unlock.new")}
        </Link>
      </div>
    </div>
  );
}
