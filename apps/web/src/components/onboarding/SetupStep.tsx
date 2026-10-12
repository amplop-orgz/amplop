// Board 0.3 Set up envelopes and the split editor (07 S07-14 to S07-18, S07-23, S07-24). 13 reuses
// the editor for a split change after the first allowance.
"use client";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { formatDayTime } from "@amplop/shared/dates";
import { shortName } from "@amplop/shared/names";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { parseEventLogs, type TransactionReceipt } from "viem";
import { Button, InlineMessage, ListCard, Page, Stepper, Switch, TopBar } from "@/components/ui";
import { refreshRole, useSession } from "@/lib/client/account";
import { api } from "@/lib/client/api";
import { read } from "@/lib/client/chain/client";
import { ChainError, sendUserTx, type TxStatus } from "@/lib/client/chain/write";
import { useAccount, type AccountData } from "@/lib/client/data";
import { errorKey } from "@/lib/client/errors";
import { hasKey, useT, type Key } from "@/lib/client/i18n";
import {
  canLess,
  canMore,
  clearDraft,
  DEFAULT_SPLIT,
  fundingFor,
  readDraft,
  splitValid,
  step,
  total,
  writeDraft,
  type Split,
} from "@/lib/client/onboarding";
import { setProfileLabel } from "@/lib/client/profiles";

const COLORS = ["bg-food", "bg-transport", "bg-study", "bg-everyday", "bg-emergency"];

/** S13-5: the split that applies next: a saved split (waiting or started), else the one in force. */
export function nextSplit(a: Pick<AccountData, "info">): readonly number[] {
  return a.info.pendingSplitStartsAt > 0n ? a.info.pendingSplit : a.info.split;
}

export function SetupStep() {
  const { t, lang } = useT();
  const router = useRouter();
  const { session, role } = useSession();
  const accountId = typeof role === "object" ? role.studentAccountId : undefined;
  const edit = accountId !== undefined;
  const account = useAccount(accountId);
  const [split, setSplit] = useState<Split | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [slowFunding, setSlowFunding] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [profileRetry, setProfileRetry] = useState<{ accountId: bigint; name: string } | null>(
    null,
  );

  useEffect(() => {
    if (!session || split) return;
    const draft = readDraft(session.credentialId);
    if (!edit && !draft.name) {
      router.replace("/app/name");
      return;
    }
    if (draft.split) setSplit(draft.split);
    else if (!edit) setSplit(DEFAULT_SPLIT);
    else if (account.data) setSplit([...nextSplit(account.data)] as Split);
  }, [session, edit, account.data, split, router]);

  if (!session || !split) return null;
  const sum = total(split);
  const unchanged =
    edit && account.data !== undefined && nextSplit(account.data).every((v, i) => v === split[i]);
  const ok = splitValid(split) && !unchanged;
  // S13-5: the line above "Save split".
  const editNote = !account.data
    ? null
    : !account.data.info.everDeposited
      ? t("setup.editAtOnce")
      : account.data.info.pendingSplitStartsAt > account.data.clock
        ? t("setup.editReplaces")
        : t("setup.editStarts", {
            at: formatDayTime(Number(account.data.clock + 48n * 3600n), lang),
          });

  const change = (i: number, delta: 5 | -5) => {
    const next = step(split, i, delta);
    setSplit(next);
    writeDraft(session.credentialId, { split: next });
  };

  const onStatus = (s: TxStatus) => {
    if (s === "funding") setBusy(t("tx.funding"));
    else if (s === "sending" || s === "confirming")
      setBusy(t(edit ? "setup.saving" : "setup.creating"));
  };

  const saveName = async (id: bigint, name: string) => {
    setProfileRetry({ accountId: id, name });
    await api.post(
      "/api/profile",
      { accountId: id.toString(), name },
      { auth: { action: "profile.save", accountId: id } },
    );
    setProfileLabel(session.credentialId, shortName(name));
    clearDraft(session.credentialId);
    setProfileRetry(null);
    router.push("/app/invite");
  };

  const finishSignUp = async (receipt: TransactionReceipt | null) => {
    let id: bigint | undefined;
    if (receipt) {
      const [created] = parseEventLogs({
        abi: amplopEnvelopesAbi,
        logs: receipt.logs,
        eventName: "AccountCreated",
      });
      id = (created?.args as { accountId?: bigint } | undefined)?.accountId;
    }
    id ??= await read<bigint>("accountOf", [session.address]);
    await refreshRole();
    const name = readDraft(session.credentialId).name ?? "";
    try {
      await saveName(id, name);
    } catch {
      setBusy(null);
      setError("name.notSaved");
    }
  };

  const go = async () => {
    setError(null);
    setBusy(t("tx.funding"));
    if (edit) {
      try {
        const { receipt } = await sendUserTx(
          { functionName: "saveSplit", args: [split] },
          { onStatus },
        );
        clearDraft(session.credentialId);
        const [saved] = parseEventLogs({
          abi: amplopEnvelopesAbi,
          logs: receipt.logs,
          eventName: "SplitSaved",
        });
        const a = saved?.args as { immediate?: boolean; startsAt?: bigint } | undefined;
        router.push(
          a && !a.immediate
            ? `/app/settings?saved=later&startsAt=${String(a.startsAt ?? 0n)}`
            : "/app/settings?saved=now",
        );
      } catch (e) {
        setBusy(null);
        setError(errorKey(e, hasKey) as Key);
      }
      return;
    }
    const slow = setTimeout(() => {
      setSlowFunding(true);
    }, 2000);
    try {
      await fundingFor(session.credentialId);
      const { receipt } = await sendUserTx(
        { functionName: "register", args: [split] },
        { onStatus },
      );
      await finishSignUp(receipt);
    } catch (e) {
      // S07-18: a second tab, or a lost receipt that landed: carry on if the account exists.
      if (e instanceof ChainError && e.errorName === "AlreadyHasAccount") {
        await finishSignUp(null).catch(() => undefined);
        return;
      }
      setBusy(null);
      setError(errorKey(e, hasKey) as Key);
    } finally {
      clearTimeout(slow);
      setSlowFunding(false);
    }
  };

  return (
    <>
      <TopBar back={edit ? "/app/settings" : "/app/name"} title={t("setup.title")} />
      <Page className="gap-3.5">
        <p className="m-0 text-[0.875rem] text-muted">{t("setup.line")}</p>
        <div className="flex flex-col gap-2.5">
          <ListCard>
            {split.map((v, i) => {
              const name = t(`envelope.${String(i)}` as Key);
              const sub =
                i < 3 ? t("setup.weekly") : i === 3 ? t("setup.everydaySub") : t("setup.locked");
              return (
                <div key={i} className="flex min-h-[58px] items-center gap-3 py-2">
                  <div className={`size-3 shrink-0 rounded-[3px] ${COLORS[i] ?? ""}`} />
                  <div className="flex min-w-0 flex-1 flex-col gap-px">
                    <div className="font-bold">{name}</div>
                    <div className="text-[0.8125rem] text-muted">{sub}</div>
                  </div>
                  <Stepper
                    value={v}
                    name={name}
                    canLess={canLess(split, i) && !busy}
                    canMore={canMore(split, i) && !busy}
                    onLess={() => {
                      change(i, -5);
                    }}
                    onMore={() => {
                      change(i, 5);
                    }}
                  />
                </div>
              );
            })}
          </ListCard>
          <div className="flex flex-col gap-1 px-[17px]" aria-live="polite">
            <div className="flex items-center justify-between">
              <div className="text-muted">{t("setup.total")}</div>
              <div className={`amount font-bold ${sum === 100 ? "" : "text-danger"}`}>{sum}%</div>
            </div>
            {sum !== 100 ? (
              <div className="text-[0.875rem] text-danger">{t("setup.mustAdd", { sum })}</div>
            ) : null}
          </div>
        </div>
        <ListCard>
          {edit ? null : (
            <div className="flex min-h-[60px] items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 flex-col gap-px">
                <div className="font-bold">{t("setup.lock")}</div>
                <div className="text-[0.8125rem] text-muted">{t("setup.lockSub")}</div>
                <div className="text-[0.8125rem] text-muted">{t("setup.lockLater")}</div>
              </div>
              <Switch checked disabled label={t("setup.lock")} />
            </div>
          )}
          <div className="flex min-h-14 items-center justify-between gap-3">
            <div className="font-bold">{t("setup.blocked")}</div>
            <div className="text-[0.9375rem] whitespace-nowrap text-muted">
              {t("setup.gambling")}
            </div>
          </div>
        </ListCard>
        <div className="flex-1" />
        {error ? (
          <InlineMessage
            kind="error"
            onRetry={
              profileRetry
                ? () => {
                    setError(null);
                    void saveName(profileRetry.accountId, profileRetry.name).catch(() => {
                      setError("name.notSaved");
                    });
                  }
                : undefined
            }
          >
            {t(error)}
          </InlineMessage>
        ) : null}
        {slowFunding ? <div className="text-[0.875rem] text-muted">{t("fund.wait")}</div> : null}
        {edit && editNote ? <p className="m-0 text-[0.875rem] text-muted">{editNote}</p> : null}
        <Button disabled={!ok} busyLabel={busy} onClick={() => void go()}>
          {edit ? t("setup.saveSplit") : t("common.continue")}
        </Button>
      </Page>
    </>
  );
}
