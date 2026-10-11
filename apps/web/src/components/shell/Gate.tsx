// Board 0.1 Open in browser (07 S07-6), shown in place of any shell route in a chat app's browser.
"use client";
import { Copy, Globe } from "lucide-react";
import { useState } from "react";
import { Button, ListCard } from "@/components/ui";
import { useT } from "@/lib/client/i18n";
import { copyText } from "@/lib/client/share";

export function Gate({ onSkip }: { onSkip: () => void }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const copy = () => {
    copyText(location.href).then(
      () => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 3000);
      },
      () => {
        setFailed(true);
      },
    );
  };
  return (
    <div className="flex min-h-dvh flex-col gap-6 px-5 pt-[72px] pb-6">
      <div className="flex flex-col gap-3.5">
        <div className="flex size-16 items-center justify-center rounded-full border border-border bg-card text-link">
          <Globe size={30} aria-hidden="true" />
        </div>
        <h1 className="m-0 text-[1.625rem] leading-tight font-bold">{t("gate.title")}</h1>
        <p className="m-0 text-muted">{t("gate.body")}</p>
      </div>
      <ListCard>
        {(["gate.step1", "gate.step2", "gate.step3"] as const).map((k, i) => (
          <div key={k} className="flex min-h-14 items-center gap-3">
            <div className="amount flex size-7 shrink-0 items-center justify-center rounded-full bg-quiet text-[0.875rem] font-bold">
              {i + 1}
            </div>
            <div className="text-[0.9375rem]">{t(k)}</div>
          </div>
        ))}
      </ListCard>
      <div className="flex-1" />
      {failed ? (
        <label className="flex flex-col gap-2 text-[0.875rem] font-bold">
          {t("gate.address")}
          <input
            readOnly
            value={typeof location === "undefined" ? "" : location.href}
            onFocus={(e) => {
              e.currentTarget.select();
            }}
            className="h-12 rounded-[12px] border border-input-border bg-card px-3 font-normal"
          />
        </label>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button onClick={copy}>
          <Copy size={18} aria-hidden="true" />
          {copied ? t("common.linkCopied") : t("common.copyLink")}
        </Button>
        <Button variant="text" onClick={onSkip}>
          {t("gate.tryHere")}
        </Button>
      </div>
    </div>
  );
}
