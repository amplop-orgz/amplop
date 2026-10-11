// Board 0.5 Invite accepted, on the trusted person's phone (10 S10-12 to S10-19).
"use client";
import { PendingKind } from "@amplop/shared/enums";
import { shortName } from "@amplop/shared/names";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { Button, ButtonLink, CheckLine, InlineMessage } from "@/components/ui";
import {
  createPasskeyAccount,
  resolveRole,
  signInWithPasskey,
  type Session,
} from "@/lib/client/account";
import { api, ApiError } from "@/lib/client/api";
import { read, ZERO_ADDRESS, type AccountInfo } from "@/lib/client/chain/client";
import { ChainError, ensureFunded, sendUserTx, type TxStatus } from "@/lib/client/chain/write";
import { CHAIN_ID, CONTRACT } from "@/lib/client/env";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import { existingPasskeyDecision, parseInviteFragment, signAccept } from "@/lib/client/invite";
import { listProfiles } from "@/lib/client/profiles";

type InviteView = {
  accountId: string;
  studentName: string;
  trustedName: string;
  inviteKey: string;
  state: "open" | "used" | "expired" | "replaced";
};
type Screen = "loading" | "offline" | "invalid" | "used" | "expired" | "replaced" | "open";

const STATE_ERRORS: Record<string, Screen> = {
  InviteUsed: "used",
  InviteExpired: "expired",
  NoInvite: "invalid",
  BadSignature: "invalid",
};

export function InviteAccept({ inviteId }: { inviteId: string }) {
  const { t } = useT();
  const router = useRouter();
  const key = useRef<Hex | null>(null);
  const [invite, setInvite] = useState<InviteView | null>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [alreadyYours, setAlreadyYours] = useState(false);
  const [notNow, setNotNow] = useState(false);
  const [hasProfiles, setHasProfiles] = useState(false);

  const load = useCallback(() => {
    setScreen("loading");
    const k = parseInviteFragment(location.hash);
    if (!k) {
      setScreen("invalid");
      return;
    }
    api.get<InviteView>(`/api/invite/${inviteId}`).then(
      (v) => {
        if (privateKeyToAddress(k).toLowerCase() !== v.inviteKey.toLowerCase()) {
          setScreen("invalid");
          return;
        }
        key.current = k;
        setInvite(v);
        setScreen(v.state);
      },
      (e: unknown) => {
        setScreen(e instanceof ApiError && e.status === 404 ? "invalid" : "offline");
      },
    );
  }, [inviteId]);

  useEffect(() => {
    setHasProfiles(listProfiles().length > 0);
    load();
  }, [load]);

  const short = invite?.studentName ? shortName(invite.studentName) : t("common.theStudent");

  const linkWith = async (session: Session) => {
    const k = key.current;
    if (!k || !invite) return;
    const accountId = BigInt(invite.accountId);
    void ensureFunded(session.address).catch(() => undefined);
    const signature = await signAccept(k, CHAIN_ID, CONTRACT, accountId, session.address);
    const onStatus = (s: TxStatus) => {
      setBusy(s === "funding" ? t("tx.funding") : t("accept.linking", { short }));
    };
    const info = await read<AccountInfo>("accountInfo", [accountId]);
    if (info.trusted !== ZERO_ADDRESS) {
      const [active, readyAt] = await read<readonly [boolean, bigint, Hex]>("pending", [
        accountId,
        PendingKind.TrustedRemoval,
      ]);
      const clock = await read<bigint>("clock", [accountId]);
      if (!(active && clock >= readyAt)) {
        setBusy(null);
        setMessage(t("accept.hasTrusted", { short }));
        return;
      }
      await sendUserTx({ functionName: "finishRemoveTrusted", args: [accountId] }, { onStatus });
    }
    await sendUserTx({ functionName: "acceptInvite", args: [accountId, signature] }, { onStatus });
    history.replaceState(null, "", location.pathname);
    key.current = null;
    router.replace("/app/parent");
  };

  const fail = (e: unknown) => {
    setBusy(null);
    if (e instanceof ChainError) {
      const s = STATE_ERRORS[e.errorName];
      if (s) {
        setScreen(s);
        return;
      }
      if (e.errorName === "CannotTrustSelf") {
        setMessage(t("accept.ownInvite"));
        return;
      }
      if (e.errorName === "AlreadyTrusted") {
        setMessage(t("accept.otherStudent"));
        return;
      }
      if (e.errorName === "TrustedAlreadyLinked") {
        setMessage(t("accept.hasTrusted", { short }));
        return;
      }
    }
    setMessage(t(errorKey(e, hasKey) as Key));
  };

  const accept = () => {
    setMessage(null);
    setBusy(t("accept.creating"));
    createPasskeyAccount("trusted", {
      studentShortName: short,
      label: invite?.trustedName ?? "Trusted person",
    })
      .then((s) => linkWith(s))
      .catch(fail);
  };

  const useExisting = () => {
    setMessage(null);
    setBusy(t("unlock.signingIn"));
    signInWithPasskey()
      .then(async (s) => {
        const decision = existingPasskeyDecision(
          await resolveRole(s.address),
          BigInt(invite?.accountId ?? "0"),
        );
        if (decision === "own") {
          setBusy(null);
          setMessage(t("accept.ownInvite"));
        } else if (decision === "already") {
          setBusy(null);
          setAlreadyYours(true);
        } else if (decision === "other") {
          setBusy(null);
          setMessage(t("accept.otherStudent"));
        } else {
          await linkWith(s);
        }
      })
      .catch(fail);
  };

  if (screen === "loading") return <div className="p-5 text-muted">{t("accept.loading")}</div>;
  if (screen === "offline") {
    return (
      <div className="p-5">
        <InlineMessage kind="offline" onRetry={load}>
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  if (screen !== "open" || !invite) {
    const copy = {
      invalid: ["accept.invalidTitle", "accept.invalidLine"],
      used: ["accept.usedTitle", "accept.usedLine"],
      expired: ["accept.expiredTitle", "accept.expiredLine"],
      replaced: ["accept.replacedTitle", "accept.replacedLine"],
      open: ["accept.invalidTitle", "accept.invalidLine"],
    }[screen] as [Key, Key];
    return (
      <div className="flex flex-col gap-3 px-5 pt-12 pb-6">
        <h1 className="m-0 text-[1.625rem] leading-tight font-bold">{t(copy[0])}</h1>
        <p className="user-text m-0 text-muted">{t(copy[1], { short })}</p>
        {screen === "used" && hasProfiles ? (
          <Button variant="text" parent onClick={useExisting} busyLabel={busy}>
            {t("accept.usePasskey")}
          </Button>
        ) : null}
        {alreadyYours ? (
          <ButtonLink href="/app/parent" parent>
            {t("accept.open")}
          </ButtonLink>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col gap-[18px] px-5 pt-12 pb-4">
      <div className="flex flex-col gap-2.5">
        <div className="text-[0.9375rem] font-bold text-emergency">{t("accept.label")}</div>
        <h1 className="user-text m-0 text-[1.625rem] leading-tight font-bold">
          {t("accept.heading", { name: invite.studentName || short })}
        </h1>
        <p className="user-text m-0 text-muted">{t("accept.line", { short })}</p>
      </div>
      <div className="flex flex-col gap-2 rounded-[16px] border border-border bg-card px-4 py-3.5">
        <div className="font-bold">{t("accept.canDo")}</div>
        <CheckLine ok>{t("accept.can1", { short })}</CheckLine>
        <CheckLine ok>{t("accept.can2")}</CheckLine>
      </div>
      <div className="flex flex-col gap-2 rounded-[16px] border border-border bg-card px-4 py-3.5">
        <div className="font-bold">{t("accept.sees")}</div>
        <CheckLine ok>{t("accept.see1")}</CheckLine>
        <CheckLine ok={false}>{t("accept.see2", { short })}</CheckLine>
      </div>
      <div className="flex-1" />
      {message ? <InlineMessage kind="error">{message}</InlineMessage> : null}
      {alreadyYours ? (
        <>
          <InlineMessage>{t("accept.alreadyYours", { short })}</InlineMessage>
          <ButtonLink href="/app/parent" parent>
            {t("accept.open")}
          </ButtonLink>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Button parent busyLabel={busy} onClick={accept}>
            <KeyRound size={20} aria-hidden="true" />
            {t("accept.accept")}
          </Button>
          <div className="text-center text-[0.875rem] text-muted">{t("accept.help")}</div>
          {notNow ? (
            <p className="user-text m-0 text-center text-[0.875rem] text-muted" aria-live="polite">
              {t("accept.notNowLine", { short })}
            </p>
          ) : (
            <Button
              variant="text"
              parent
              disabled={busy !== null}
              onClick={() => {
                setNotNow(true);
              }}
            >
              {t("accept.notNow")}
            </Button>
          )}
          {hasProfiles ? (
            <Button variant="text" parent disabled={busy !== null} onClick={useExisting}>
              {t("accept.usePasskey")}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
