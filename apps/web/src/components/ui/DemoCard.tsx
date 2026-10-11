// The demo card (06 S06-39): 350×221 at 390 wide, scaling with width; no card network marks.
"use client";
import { useT } from "@/lib/client/i18n";
import { Guilloche } from ".";
import { Logo } from "./Logo";

export function DemoCard({ name, last4 }: { name: string; last4: string }) {
  const { t } = useT();
  const empty = name.trim() === "";
  return (
    <div className="relative flex aspect-[350/221] w-full flex-col justify-between overflow-hidden rounded-[16px] bg-ink px-5 py-[18px] text-white">
      <Guilloche opacity={0.12} />
      <div className="relative flex items-center justify-between">
        <Logo variant="on-dark" height={22} />
        <div className="rounded-full border border-white/70 px-2.5 py-0.5 text-[0.8125rem] font-bold">
          {t("card.demo")}
        </div>
      </div>
      <div className="relative flex min-w-0 flex-col gap-1.5">
        <div className="amount text-[0.9375rem] tracking-[0.12em]">•••• •••• •••• {last4}</div>
        <div
          className={`truncate text-[0.9375rem] font-bold tracking-[0.06em] ${empty ? "opacity-60" : ""}`}
        >
          {empty ? t("name.placeholderCard") : name.toLocaleUpperCase()}
        </div>
      </div>
    </div>
  );
}
