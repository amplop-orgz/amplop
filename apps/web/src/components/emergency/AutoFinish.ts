// Whenever a student is signed in, finish what time has opened (12 S12-12, 13 S13-10): an Emergency
// request past `opensAt` and a lock-off past its wait. Each is sent once per request in a session,
// with no confirm step; a mined revert means someone else finished it first.
"use client";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { EmergencyStatus } from "@amplop/shared/enums";
import { formatUsd } from "@amplop/shared/money";
import { useEffect } from "react";
import { parseEventLogs } from "viem";
import { showToast } from "@/components/ui";
import { ChainError, sendUserTx, type Call } from "@/lib/client/chain/write";
import { clockNow, useEmergency } from "@/lib/client/emergency";
import { useT } from "@/lib/client/i18n";
import { invalidateAll } from "@/lib/client/query";

/** This device's finalize hashes by request, for the opened notice's proof link (S12-10). */
export const finalizeTx = new Map<string, string>();

const sentFor = new Set<string>();

function sendOnce(
  key: string,
  call: Call,
  onDone: (r: Awaited<ReturnType<typeof sendUserTx>>) => void,
) {
  if (sentFor.has(key)) return;
  sentFor.add(key);
  sendUserTx(call)
    .then(onDone)
    .catch((e: unknown) => {
      // Refused in simulation, so nothing was sent (a clock estimate a little ahead of the chain):
      // try again on a later read. A timeout or a mined revert keeps the one send.
      if (e instanceof ChainError && !e.reverted) sentFor.delete(key);
      invalidateAll();
    });
}

export function useStudentAutoFinish(accountId: bigint | undefined): void {
  const { t } = useT();
  const data = useEmergency(accountId);
  const d = data.data;
  const id = accountId?.toString() ?? "";
  const emKey = d ? `em:${id}:${d.em.requestSeq.toString()}` : null;
  const emDue =
    d !== undefined && d.em.status === EmergencyStatus.Open && clockNow(d) >= d.em.opensAt;
  const lockKey = d ? `lock:${id}:${d.lockOffReadyAt.toString()}` : null;
  const lockDue = d !== undefined && d.lockOffPending && clockNow(d) >= d.lockOffReadyAt;
  const decimals = d?.decimals ?? 6;

  useEffect(() => {
    if (!emDue || !emKey || accountId === undefined) return;
    sendOnce(emKey, { functionName: "finalizeEmergency", args: [accountId] }, (r) => {
      finalizeTx.set(`${accountId.toString()}:${emKey.split(":")[2] ?? ""}`, r.hash);
      showToast(t("emergency.autoOpened"));
    });
  }, [emDue, emKey, accountId, t]);

  useEffect(() => {
    if (!lockDue || !lockKey || accountId === undefined) return;
    sendOnce(lockKey, { functionName: "finishLockOff", args: [accountId] }, (r) => {
      const [done] = parseEventLogs({
        abi: amplopEnvelopesAbi,
        logs: r.receipt.logs,
        eventName: "LockOffDone",
      });
      const moved = (done?.args as { moved?: bigint } | undefined)?.moved ?? 0n;
      showToast(t("settings.lockOffDone", { moved: formatUsd(moved, decimals) }));
    });
  }, [lockDue, lockKey, accountId, decimals, t]);
}
