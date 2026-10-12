// Board 4.1 Settings (13 S13-1 to S13-14, S13-21): the rules, waiting changes with countdowns and a
// Cancel for each (R24), the demo rows, language, passkey and sign out.
"use client";
import { formatDayTime } from "@amplop/shared/dates";
import { PendingKind } from "@amplop/shared/enums";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SkipTimeRow, ViewAsRow } from "@/components/demo/DemoControls";
import { TrustedPersonRow } from "@/components/trusted/TrustedPersonRow";
import {
  Button,
  InfoBox,
  InlineMessage,
  LanguageToggle,
  ListCard,
  Page,
  Sheet,
  showToast,
  Switch,
  TopBar,
} from "@/components/ui";
import { signOut, useSession } from "@/lib/client/account";
import { read, ZERO_ADDRESS } from "@/lib/client/chain/client";
import { sendUserTx } from "@/lib/client/chain/write";
import { useTrustedName } from "@/lib/client/data";
import { clockNow, countdownText } from "@/lib/client/emergency";
import { errorKey } from "@/lib/client/errors";
import { DEMO } from "@/lib/client/env";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import { useRead } from "@/lib/client/query";
import {
  lockRow,
  pendingState,
  splitInForceAt,
  useSettingsData,
  type SettingsData,
} from "@/lib/client/settings";

const rowCls = "flex min-h-[60px] items-center justify-between gap-3 py-2";
const cancelCls = "flex h-11 shrink-0 items-center text-[0.9375rem] font-bold text-danger";

/** The ticking account clock (12 S12-8) for countdowns on this screen. */
function useClock(d: SettingsData | undefined): bigint {
  const [now, setNow] = useState(0n);
  useEffect(() => {
    if (!d) return;
    const tick = () => {
      setNow(clockNow(d));
    };
    tick();
    const timer = setInterval(tick, 1_000);
    return () => {
      clearInterval(timer);
    };
  }, [d]);
  return now;
}

export function Settings() {
  const { t, lang } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const data = useSettingsData(accountId);
  const trustedName = useTrustedName(accountId);
  const clock = useClock(data.data);
  const [busy, setBusy] = useState<PendingKind | "start" | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [sheet, setSheet] = useState(false);

  // S13-6: the toast after saving a split on board 0.3.
  const saved = params.get("saved");
  const startsAt = params.get("startsAt");
  useEffect(() => {
    if (!saved) return;
    showToast(
      saved === "later" && startsAt
        ? t("settings.splitSavedAt", { at: formatDayTime(Number(startsAt), lang) })
        : t("settings.splitSavedNow"),
    );
    router.replace("/app/settings");
  }, [saved, startsAt, lang, t, router]);

  // S13-21: whether a ready recovery can still be cancelled (its new owner now owns an account).
  const recovery = data.data?.pending[PendingKind.Recovery];
  const newOwner = recovery?.active ? `0x${recovery.data.slice(-40)}` : null;
  const fetchOwner = () => read<bigint>("accountOf", [newOwner]);
  const ownerAccount = useRead(newOwner ? `account-of:${newOwner}` : null, fetchOwner);

  if (accountId === undefined) return null;
  if (data.error) {
    return (
      <div className="p-5">
        <InlineMessage kind="offline" onRetry={data.refetch}>
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  const d = data.data;
  if (!d) return <div className="p-5 text-muted">{t("common.loading")}</div>;
  const hasTrusted = d.info.trusted !== ZERO_ADDRESS;
  const name = trustedName ?? t("common.yourTrustedPerson");
  const at = (s: bigint) => formatDayTime(Number(s), lang);
  const left = (s: bigint) => countdownText(t, Number(s - clock));

  const cancel = (kind: PendingKind, toast: Key) => {
    setBusy(kind);
    setError(null);
    sendUserTx({ functionName: "cancelPending", args: [kind] }).then(
      () => {
        setBusy(null);
        showToast(t(toast));
        data.refetch();
      },
      (e: unknown) => {
        setBusy(null);
        data.refetch();
        setError(errorKey(e, hasKey) as Key);
      },
    );
  };
  const startLockOff = () => {
    setBusy("start");
    setError(null);
    sendUserTx({ functionName: "startLockOff", args: [] }).then(
      () => {
        setBusy(null);
        setSheet(false);
        data.refetch();
      },
      (e: unknown) => {
        setBusy(null);
        setError(errorKey(e, hasKey) as Key);
      },
    );
  };

  const split = d.pending[PendingKind.Split];
  const splitState = pendingState(split, clock);
  const lock = lockRow(d, clock);
  const lockOff = d.pending[PendingKind.LockOff];
  const recState = pendingState(d.pending[PendingKind.Recovery], clock);
  const splitText = (s: readonly number[]) =>
    s.map((v, i) => `${t(`envelope.${String(i)}` as Key)} ${String(v)}`).join(" · ");

  return (
    <>
      <TopBar back="/app" title={t("settings.title")} />
      <Page className="gap-3">
        {recState !== "none" ? (
          <div
            className="flex flex-col gap-2 rounded-[16px] bg-[#FFE7E4] p-4"
            data-testid="recovery-card"
          >
            <div className="font-bold text-[#A51F1E]">{t("settings.recoveryTitle")}</div>
            <p className="user-text m-0 text-[0.875rem]">
              {t("settings.recoveryBody", {
                name,
                at: at(d.pending[PendingKind.Recovery].readyAt),
                left: left(d.pending[PendingKind.Recovery].readyAt),
              })}
            </p>
            {recState === "waiting" || (ownerAccount.data ?? 0n) !== 0n ? (
              <Button
                variant="secondary"
                className="text-danger"
                busyLabel={busy === PendingKind.Recovery ? t("emergency.cancelling") : null}
                onClick={() => {
                  cancel(PendingKind.Recovery, "settings.recoveryCancelled");
                }}
              >
                {t("settings.cancelRecovery")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {error ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}

        <ListCard>
          <TrustedPersonRow accountId={accountId} />
          <div className={rowCls}>
            <div className="flex min-w-0 flex-col gap-px">
              <div className="font-bold">{t("settings.lock")}</div>
              <div className="user-text text-[0.8125rem] text-muted" data-testid="lock-line">
                {lock === "requestOpen"
                  ? t("settings.lockRequestOpen")
                  : lock === "on"
                    ? hasTrusted
                      ? t("settings.lockOnTrusted", { name })
                      : t("settings.lockOn")
                    : lock === "waiting"
                      ? t("settings.lockWaiting", {
                          at: at(lockOff.readyAt),
                          left: left(lockOff.readyAt),
                        })
                      : lock === "ready"
                        ? t("settings.lockReady")
                        : t("settings.lockOff")}
              </div>
              {lock === "waiting" ? (
                <button
                  type="button"
                  className={cancelCls}
                  disabled={busy !== null}
                  onClick={() => {
                    cancel(PendingKind.LockOff, "settings.lockStays");
                  }}
                >
                  {busy === PendingKind.LockOff ? t("emergency.cancelling") : t("settings.cancel")}
                </button>
              ) : null}
            </div>
            <Switch
              checked={lock !== "off"}
              disabled={lock !== "on"}
              label={t("settings.lock")}
              onChange={() => {
                setSheet(true);
              }}
            />
          </div>
          <div className={rowCls}>
            <div className="flex min-w-0 flex-col gap-px">
              <div className="font-bold">{t("settings.split")}</div>
              <div className="text-[0.8125rem] text-muted" data-testid="split-line">
                {splitText(splitInForceAt(d.info, splitState))}
              </div>
              {splitState === "waiting" ? (
                <>
                  <div className="text-[0.8125rem]" data-testid="split-pending">
                    {t("settings.newSplit", {
                      at: at(split.readyAt),
                      split: splitText(d.info.pendingSplit),
                    })}
                  </div>
                  <div className="text-[0.8125rem] text-muted">
                    {t("settings.left", { left: left(split.readyAt) })}
                  </div>
                  <button
                    type="button"
                    className={cancelCls}
                    disabled={busy !== null}
                    onClick={() => {
                      cancel(PendingKind.Split, "settings.splitCancelled");
                    }}
                  >
                    {busy === PendingKind.Split ? t("emergency.cancelling") : t("settings.cancel")}
                  </button>
                </>
              ) : null}
            </div>
            <Link
              href="/app/setup?edit=1"
              className="flex h-11 shrink-0 items-center text-[0.9375rem] font-bold text-link no-underline"
            >
              {t("settings.edit")}
            </Link>
          </div>
          <div className={rowCls}>
            <div className="font-bold">{t("setup.blocked")}</div>
            <div className="text-[0.9375rem] text-muted">{t("setup.gambling")}</div>
          </div>
        </ListCard>

        <ListCard>
          {DEMO ? (
            <>
              <ViewAsRow name={name} />
              <SkipTimeRow accountId={accountId} />
            </>
          ) : null}
          <div className={rowCls}>
            <div className="font-bold">{t("settings.language")}</div>
            <LanguageToggle />
          </div>
        </ListCard>

        <ListCard>
          <div className={rowCls}>
            <div className="font-bold">{t("settings.passkey")}</div>
            <div className="text-[0.9375rem] text-muted">{t("settings.thisPhone")}</div>
          </div>
        </ListCard>

        <InfoBox>
          {hasTrusted ? t("settings.infoTrusted", { name }) : t("settings.infoAlone")}
        </InfoBox>
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
      <Sheet
        open={sheet}
        onClose={() => {
          setSheet(false);
        }}
        title={t("settings.lockSheetTitle")}
      >
        <p className="user-text m-0">
          {hasTrusted ? t("settings.lockSheetBodyTrusted", { name }) : t("settings.lockSheetBody")}
        </p>
        <Button busyLabel={busy === "start" ? t("tx.sending") : null} onClick={startLockOff}>
          {t("settings.lockSheetGo")}
        </Button>
        <Button
          variant="text"
          disabled={busy === "start"}
          onClick={() => {
            setSheet(false);
          }}
        >
          {t("settings.lockSheetKeep")}
        </Button>
      </Sheet>
    </>
  );
}
