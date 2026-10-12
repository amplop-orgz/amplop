// 12 S12-12: when the student opens the app after `opensAt`, send finalizeEmergency once per request
// in this session, with no confirm step. A revert means someone else opened it first.
"use client";
import { EmergencyStatus } from "@amplop/shared/enums";
import { useEffect, useRef } from "react";
import { showToast } from "@/components/ui";
import { ChainError, sendUserTx } from "@/lib/client/chain/write";
import { clockNow, useEmergency } from "@/lib/client/emergency";
import { useT } from "@/lib/client/i18n";
import { invalidateAll } from "@/lib/client/query";

/** This device's finalize hashes by request, for the opened notice's proof link (S12-10). */
export const finalizeTx = new Map<string, string>();

const sentFor = new Set<string>();

export function useStudentAutoFinish(accountId: bigint | undefined): void {
  const { t } = useT();
  const data = useEmergency(accountId);
  const d = data.data;
  const key =
    d && accountId !== undefined ? `${accountId.toString()}:${d.em.requestSeq.toString()}` : null;
  const due =
    d !== undefined && d.em.status === EmergencyStatus.Open && clockNow(d) >= d.em.opensAt;
  const busy = useRef(false);
  useEffect(() => {
    if (!due || !key || accountId === undefined || sentFor.has(key) || busy.current) return;
    sentFor.add(key);
    busy.current = true;
    sendUserTx({ functionName: "finalizeEmergency", args: [accountId] })
      .then((r) => {
        finalizeTx.set(key, r.hash);
        showToast(t("emergency.autoOpened"));
      })
      .catch((e: unknown) => {
        // Refused in simulation, so nothing was sent (WaitNotOver while the clock estimate runs ahead):
        // try again on a later read. A timeout or a mined revert keeps the one send.
        if (e instanceof ChainError && !e.reverted) sentFor.delete(key);
        invalidateAll();
      })
      .finally(() => {
        busy.current = false;
      });
  }, [due, key, accountId, t]);
}
