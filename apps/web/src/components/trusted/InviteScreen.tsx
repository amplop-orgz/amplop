// Board 0.4 Invite (10 S10-1 to S10-7). The one-time key lives only in a ref while this screen is open.
"use client";
import { normalizeName } from "@amplop/shared/names";
import { formatDayTime } from "@amplop/shared/dates";
import { Copy, Share } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import {
  Button,
  ButtonLink,
  CheckLine,
  InfoBox,
  InlineMessage,
  Page,
  TextField,
  TopBar,
} from "@/components/ui";
import { useSession } from "@/lib/client/account";
import { api, ApiError } from "@/lib/client/api";
import { sendUserTx, type TxStatus } from "@/lib/client/chain/write";
import {
  hasTrusted,
  inviteOpen,
  useAccount,
  useLatestInvite,
  useTrustedName,
} from "@/lib/client/data";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import { inviteLink } from "@/lib/client/invite";
import { readDraft } from "@/lib/client/onboarding";
import { copyText, whatsappUrl } from "@/lib/client/share";

type Ready = { link: string; name: string };

export function InviteScreen() {
  const { t, lang } = useT();
  const { session, role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const account = useAccount(accountId);
  const latest = useLatestInvite(accountId);
  const trustedName = useTrustedName(accountId) ?? t("common.yourTrustedPerson");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [copied, setCopied] = useState(false);
  const key = useRef<Hex | null>(null);
  const pending = useRef<{ inviteKey: string; name: string } | null>(null);
  const prefilled = useRef(false);

  useEffect(() => {
    if (prefilled.current || latest.data === undefined) return;
    prefilled.current = true;
    if (latest.data) setName(latest.data.trustedName);
  }, [latest.data]);

  // Leaving the route drops the key (S10-5).
  useEffect(
    () => () => {
      key.current = null;
    },
    [],
  );

  const fromSignUp = session ? Boolean(readDraft(session.credentialId).name) : false;
  const a = account.data;
  if (!a || accountId === undefined)
    return <div className="p-5 text-muted">{t("common.loading")}</div>;
  const n = normalizeName(name);
  const shareText = (r: Ready) => t("invite.whatsapp", { name: r.name, link: r.link });

  const saveRow = async (inviteKey: string, trusted: string): Promise<string> => {
    let last: unknown;
    for (const wait of [0, 1000, 3000, 9000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        const r = await api.post<{ inviteId: string }>(
          "/api/invite",
          { accountId: accountId.toString(), inviteKey, trustedName: trusted },
          { auth: { action: "invite.create", accountId } },
        );
        return r.inviteId;
      } catch (e) {
        last = e;
        if (e instanceof ApiError && e.status !== 0 && e.status < 500) throw e;
      }
    }
    throw last instanceof Error ? last : new Error("invite not saved");
  };

  const finish = async (via: "share" | "copy") => {
    const k = key.current;
    const p = pending.current;
    if (!k || !p) return;
    const inviteId = await saveRow(p.inviteKey, p.name);
    const r = { link: inviteLink(location.origin, inviteId, k), name: p.name };
    setReady(r);
    setBusy(null);
    if (via === "share") location.href = whatsappUrl(shareText(r), { secret: true });
    return r;
  };

  const make = (via: "share" | "copy") => {
    if (!n.ok) return;
    setError(null);
    const k = generatePrivateKey();
    key.current = k;
    const inviteKey = privateKeyToAddress(k).toLowerCase();
    pending.current = { inviteKey, name: n.value };
    const onStatus = (s: TxStatus) => {
      setBusy(s === "funding" ? t("tx.funding") : t("invite.creating"));
    };
    setBusy(t("tx.funding"));
    const linkPromise = sendUserTx(
      { functionName: "createInvite", args: [inviteKey] },
      { onStatus },
    ).then(async () => {
      const r = await finish(via).catch((e: unknown) => {
        setBusy(null);
        setError(
          e instanceof ApiError && e.status !== 0
            ? (errorKey(e, hasKey) as Key)
            : "invite.notSaved",
        );
        throw e;
      });
      if (!r) throw new Error("no invite");
      return r.link;
    });
    linkPromise.catch((e: unknown) => {
      setBusy(null);
      setError((prev) => prev ?? (errorKey(e, hasKey) as Key));
    });
    // Copy: the clipboard item is made inside the tap, from a promise of the link (Safari).
    if (via === "copy") {
      copyText(linkPromise).then(flashCopied, () => undefined);
    }
  };

  const flashCopied = () => {
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 3000);
  };

  const retrySave = () => {
    setError(null);
    setBusy(t("invite.creating"));
    finish("copy").catch(() => {
      setBusy(null);
      setError("invite.notSaved");
    });
  };

  // S10-3 states other than the form.
  if (!ready && hasTrusted(a) && !a.removal.active) {
    return (
      <>
        <TopBar back="/app" />
        <Page>
          <h2 className="m-0 text-[1.25rem] font-bold">{t("invite.heading")}</h2>
          <InfoBox>
            <span className="user-text">{t("invite.linked", { name: trustedName })}</span>
          </InfoBox>
          <Link
            href="/app/settings"
            className="flex min-h-12 items-center font-bold text-link no-underline"
          >
            {t("invite.goSettings")}
          </Link>
        </Page>
      </>
    );
  }
  if (!ready && a.removal.active) {
    return (
      <>
        <TopBar back="/app" />
        <Page>
          <h2 className="m-0 text-[1.25rem] font-bold">{t("invite.heading")}</h2>
          <InfoBox icon="clock">
            <span className="user-text">
              {t("invite.removalPending", {
                name: trustedName,
                when: formatDayTime(Number(a.removal.readyAt), lang),
              })}
            </span>
          </InfoBox>
        </Page>
      </>
    );
  }

  if (ready) {
    return (
      <>
        <TopBar back="/app" />
        <Page>
          <h2 className="m-0 text-[1.25rem] font-bold">{t("invite.heading")}</h2>
          <InfoBox>
            <span className="user-text">{t("invite.ready", { name: ready.name })}</span>
          </InfoBox>
          <div className="flex-1" />
          <div className="flex flex-col gap-2">
            <ButtonLink href={whatsappUrl(shareText(ready), { secret: true })}>
              <Share size={18} aria-hidden="true" />
              {t("invite.share")}
            </ButtonLink>
            <Button
              variant="secondary"
              onClick={() => {
                copyText(ready.link).then(flashCopied, () => undefined);
              }}
            >
              <Copy size={18} aria-hidden="true" />
              {copied ? t("common.linkCopied") : t("invite.copy")}
            </Button>
            <ButtonLink variant="text" href="/app">
              {t("common.done")}
            </ButtonLink>
          </div>
        </Page>
      </>
    );
  }

  const shown = n.ok ? n.value : null;
  return (
    <>
      <TopBar back={fromSignUp ? "/app/setup" : "/app"} />
      <Page>
        <h2 className="m-0 text-[1.25rem] leading-snug font-bold">{t("invite.heading")}</h2>
        <p className="m-0 font-bold">{t("invite.line")}</p>
        <TextField
          label={t("invite.nameLabel")}
          placeholder={t("invite.namePlaceholder")}
          value={name}
          autoComplete="off"
          autoCapitalize="words"
          onChange={(e) => {
            setName(e.target.value);
          }}
          error={
            !n.ok && n.reason !== "empty"
              ? t(n.reason === "too_long" ? "name.tooLong" : "name.badChars")
              : null
          }
        />
        {inviteOpen(a) ? <InfoBox>{t("invite.earlier")}</InfoBox> : null}
        <div className="flex flex-col gap-2 rounded-[16px] border border-border bg-card px-4 py-3.5">
          <div className="user-text font-bold">
            {shown ? t("invite.canDo", { name: shown }) : t("invite.canDoThey")}
          </div>
          <CheckLine ok>{t("invite.can1")}</CheckLine>
          <CheckLine ok>{t("invite.can2")}</CheckLine>
          <CheckLine ok>{t("invite.can3")}</CheckLine>
        </div>
        <div className="flex flex-col gap-2 rounded-[16px] border border-border bg-card px-4 py-3.5">
          <div className="user-text font-bold">
            {shown ? t("invite.sees", { name: shown }) : t("invite.seesThey")}
          </div>
          <CheckLine ok>{t("invite.see1")}</CheckLine>
          <CheckLine ok={false}>{t("invite.see2")}</CheckLine>
        </div>
        <div className="flex-1" />
        {error ? (
          <InlineMessage
            kind="error"
            onRetry={error === "invite.notSaved" && key.current ? retrySave : undefined}
          >
            {t(error)}
          </InlineMessage>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button
            disabled={!n.ok}
            busyLabel={busy}
            onClick={() => {
              make("share");
            }}
          >
            <Share size={18} aria-hidden="true" />
            {t("invite.share")}
          </Button>
          <Button
            variant="secondary"
            disabled={!n.ok || busy !== null}
            onClick={() => {
              make("copy");
            }}
          >
            <Copy size={18} aria-hidden="true" />
            {copied ? t("common.linkCopied") : t("invite.copy")}
          </Button>
          <ButtonLink variant="text" href="/app">
            {t("invite.skip")}
          </ButtonLink>
          <div className="text-center text-[0.8125rem] text-muted">{t("invite.footer")}</div>
        </div>
      </Page>
    </>
  );
}
