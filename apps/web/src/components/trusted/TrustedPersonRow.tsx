// The "Trusted person" row on Settings and its Change sheet (10 S10-21 to S10-24). 13 places it.
"use client";
import { PendingKind } from "@amplop/shared/enums";
import { formatDayTime } from "@amplop/shared/dates";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, InlineMessage, Sheet } from "@/components/ui";
import { sendUserTx } from "@/lib/client/chain/write";
import {
  hasTrusted,
  inviteOpen,
  useAccount,
  useTrustedName,
  type AccountData,
} from "@/lib/client/data";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";

export type RowState = "nobody" | "invited" | "linked" | "linkedRecovery" | "leaving" | "finishing";

/** S10-21 state picker. */
export function rowState(a: AccountData): RowState {
  if (a.removal.active) return a.clock >= a.removal.readyAt ? "finishing" : "leaving";
  if (hasTrusted(a)) return a.recovery.active ? "linkedRecovery" : "linked";
  return inviteOpen(a) ? "invited" : "nobody";
}

/** "Change" while a recovery is pending works only inside its wait (SA-02: removeTrusted cancels it). */
export function canChange(a: AccountData): boolean {
  return !a.recovery.active || a.clock < a.recovery.readyAt;
}

const linkCls = "flex h-11 items-center text-[0.9375rem] font-bold text-link no-underline";

export function TrustedPersonRow({ accountId }: { accountId: bigint }) {
  const { t, lang } = useT();
  const account = useAccount(accountId);
  const name = useTrustedName(accountId) ?? t("common.yourTrustedPerson");
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const a = account.data;
  if (!a)
    return <div className="flex min-h-[60px] items-center text-muted">{t("common.loading")}</div>;
  const state = rowState(a);
  const when = formatDayTime(Number(a.removal.readyAt), lang);

  const start = () => {
    setBusy(t("trusted.starting"));
    setError(null);
    sendUserTx({ functionName: "removeTrusted", args: [] }).then(
      () => {
        setBusy(null);
        setSheet(false);
      },
      (e: unknown) => {
        setBusy(null);
        setError(errorKey(e, hasKey) as Key);
      },
    );
  };
  const cancel = () => {
    setBusy(t("trusted.cancelling"));
    setError(null);
    sendUserTx({ functionName: "cancelPending", args: [PendingKind.TrustedRemoval] }).then(
      () => {
        setBusy(null);
        setNote(t("trusted.cancelled", { name }));
      },
      (e: unknown) => {
        setBusy(null);
        setError(errorKey(e, hasKey) as Key);
      },
    );
  };

  const [title, sub, action] = (() => {
    switch (state) {
      case "nobody":
        return [
          t("trusted.nobody"),
          t("trusted.nobodySub"),
          <Link key="a" href="/app/invite" className={linkCls}>
            {t("trusted.inviteAction")}
          </Link>,
        ];
      case "invited":
        return [
          t("trusted.invited", { name }),
          t("trusted.invitedSub"),
          <Link key="a" href="/app/invite" className={linkCls}>
            {t("trusted.sendAgain")}
          </Link>,
        ];
      case "linked":
      case "linkedRecovery":
        return [
          t("trusted.linked", { name }),
          state === "linkedRecovery" ? t("trusted.recoverySub") : note,
          <button
            key="a"
            type="button"
            disabled={!canChange(a)}
            onClick={() => {
              setSheet(true);
            }}
            className={`${linkCls} disabled:opacity-40`}
          >
            {t("trusted.change")}
          </button>,
        ];
      case "leaving":
        return [
          t("trusted.leaving", { name, when }),
          t("trusted.leavingSub"),
          <button
            key="a"
            type="button"
            disabled={busy !== null}
            onClick={cancel}
            className="flex h-11 items-center text-[0.9375rem] font-bold text-danger"
          >
            {busy ?? t("trusted.cancelChange")}
          </button>,
        ];
      case "finishing":
        return [t("trusted.finishing"), null, null];
    }
  })();

  return (
    <>
      <div className="flex min-h-[60px] items-center justify-between gap-3 py-2">
        <div className="flex min-w-0 flex-col gap-px">
          <div className="font-bold">{t("trusted.row")}</div>
          <div className="user-text text-[0.8125rem] text-muted">{title}</div>
          {sub ? <div className="text-[0.8125rem] text-muted">{sub}</div> : null}
          {error && !sheet ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <Sheet
        open={sheet}
        onClose={() => {
          setSheet(false);
        }}
        title={t("trusted.sheetTitle")}
      >
        <p className="user-text m-0 text-muted">{t("trusted.sheetLine", { name })}</p>
        {error ? <InlineMessage kind="error">{t(error)}</InlineMessage> : null}
        <Button busyLabel={busy} onClick={start}>
          {t("trusted.start")}
        </Button>
        <Button
          variant="secondary"
          disabled={busy !== null}
          onClick={() => {
            setSheet(false);
          }}
        >
          <span className="user-text">{t("trusted.keep", { name })}</span>
        </Button>
      </Sheet>
    </>
  );
}

/** S10-24: the student's app finishes a removal whose wait is over, once per page load. */
export function useTrustedHousekeeping(accountId: bigint | undefined): void {
  const account = useAccount(accountId);
  const sent = useRef(false);
  const a = account.data;
  const due = a !== undefined && a.removal.active && a.clock >= a.removal.readyAt;
  useEffect(() => {
    if (!due || sent.current || accountId === undefined) return;
    sent.current = true;
    sendUserTx({ functionName: "finishRemoveTrusted", args: [accountId] }).catch(() => undefined);
  }, [due, accountId]);
}
