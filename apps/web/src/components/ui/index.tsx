// Shared components (06 S06-39), matching design/boards/ThemeA.dc.html.
"use client";
import { ChevronLeft, CircleX, Check, Info, Clock } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { DEMO } from "@/lib/client/env";
import { useT } from "@/lib/client/i18n";

type Variant = "primary" | "secondary" | "text" | "danger";

const BASE =
  "flex w-full shrink-0 items-center justify-center gap-2 rounded-[16px] font-bold no-underline disabled:opacity-60 aria-disabled:opacity-60";
const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-white",
  secondary: "border border-input-border bg-card text-ink",
  text: "min-h-12 bg-transparent text-link",
  danger: "min-h-12 bg-transparent text-danger",
};

function classes(variant: Variant, parent: boolean, extra = ""): string {
  const height =
    variant === "text" || variant === "danger" ? "" : parent ? "min-h-14" : "min-h-[52px]";
  return `${BASE} ${height} px-4 text-[1rem] ${VARIANT[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  parent = false,
  busyLabel,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  parent?: boolean;
  busyLabel?: string | null;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled ?? Boolean(busyLabel)}
      className={classes(variant, parent, className)}
    >
      {busyLabel ?? children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  parent = false,
  className = "",
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  parent?: boolean;
  href: string;
}) {
  const cls = classes(variant, parent, className);
  if (href.startsWith("/")) {
    return (
      <Link href={href} {...rest} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} {...rest} className={cls}>
      {children}
    </a>
  );
}

export function TopBar({ back, title }: { back: string; title?: string }) {
  const { t } = useT();
  return (
    <div className="flex h-14 shrink-0 items-center gap-1 px-2">
      <Link
        href={back}
        aria-label={t("common.back")}
        className="flex size-11 items-center justify-center text-ink"
      >
        <ChevronLeft size={22} aria-hidden="true" />
      </Link>
      {title ? <h1 className="m-0 text-[1.125rem] font-bold">{title}</h1> : null}
    </div>
  );
}

export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-4 px-5 pt-1 pb-6 ${className}`}>
      {children}
    </div>
  );
}

export function Guilloche({ opacity = 0.16 }: { opacity?: number }) {
  return (
    <svg
      viewBox="0 0 350 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="absolute inset-0 size-full"
    >
      {[30, 45, 60, 75].map((y) => (
        <path
          key={y}
          d={`M0 ${String(y)} C 60 ${String(y - 30)}, 120 ${String(y + 30)}, 180 ${String(y)} S 300 ${String(y - 30)}, 350 ${String(y)}`}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={opacity}
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

export const ENVELOPE_BG = [
  "bg-food",
  "bg-transport",
  "bg-study",
  "bg-everyday",
  "bg-emergency",
] as const;

export function ListCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col rounded-[16px] border border-border bg-card px-4 [&>*+*]:border-t [&>*+*]:border-border ${className}`}
    >
      {children}
    </div>
  );
}

export function ListRow({
  title,
  sub,
  right,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex min-h-[60px] items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 flex-col gap-px">
        <div className="text-[1rem] font-bold">{title}</div>
        {sub ? <div className="text-[0.8125rem] text-muted">{sub}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function InfoBox({
  children,
  icon = "info",
}: {
  children: ReactNode;
  icon?: "info" | "clock";
}) {
  const Icon = icon === "clock" ? Clock : Info;
  return (
    <div className="flex items-start gap-3 rounded-[16px] bg-info-bg px-4 py-3.5 text-[0.875rem] text-info">
      <Icon size={20} aria-hidden="true" className="mt-px shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function InlineMessage({
  kind = "info",
  children,
  onRetry,
}: {
  kind?: "info" | "error" | "offline";
  children: ReactNode;
  onRetry?: () => void;
}) {
  const { t } = useT();
  return (
    <div
      aria-live="polite"
      className={`flex flex-col gap-2 text-[0.875rem] ${kind === "info" ? "text-muted" : "text-danger"}`}
    >
      <div>{children}</div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {t("common.tryAgain")}
        </Button>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  help,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; help?: ReactNode; error?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[0.875rem] font-bold">
        {label}
      </label>
      <input
        id={id}
        type="text"
        {...rest}
        aria-describedby={`${id}-help`}
        aria-invalid={error ? true : undefined}
        className="h-14 w-full rounded-[12px] border border-input-border bg-card px-4 text-[1.125rem] font-semibold text-ink"
      />
      <div id={`${id}-help`} aria-live="polite" className="flex flex-col gap-1 text-[0.875rem]">
        {error ? <div className="text-danger">{error}</div> : null}
        {help ? <div className="text-muted">{help}</div> : null}
      </div>
    </div>
  );
}

export function Switch({
  checked,
  label,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange?: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled ? true : undefined}
      onClick={disabled ? undefined : onChange}
      className="flex h-11 shrink-0 items-center"
    >
      <span
        className={`flex h-7 w-12 items-center rounded-full px-[3px] ${checked ? "justify-end bg-food" : "justify-start bg-input-border"}`}
      >
        <span className="block size-[22px] rounded-full bg-white" />
      </span>
    </button>
  );
}

export function Stepper({
  value,
  name,
  canLess,
  canMore,
  onLess,
  onMore,
}: {
  value: number;
  name: string;
  canLess: boolean;
  canMore: boolean;
  onLess: () => void;
  onMore: () => void;
}) {
  const { t } = useT();
  const circle =
    "flex size-9 items-center justify-center rounded-full border border-input-border bg-card text-ink";
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label={t("setup.less", { envelope: name })}
        disabled={!canLess}
        onClick={onLess}
        className="flex size-11 items-center justify-center disabled:opacity-40"
      >
        <span className={circle}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 12h12" />
          </svg>
        </span>
      </button>
      <div className="amount w-[46px] text-center font-bold" aria-live="polite">
        {value}%
      </div>
      <button
        type="button"
        aria-label={t("setup.more", { envelope: name })}
        disabled={!canMore}
        onClick={onMore}
        className="flex size-11 items-center justify-center disabled:opacity-40"
      >
        <span className={circle}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 12h12" />
            <path d="M12 6v12" />
          </svg>
        </span>
      </button>
    </div>
  );
}

/** A native modal dialog: focus stays inside, Esc and the back gesture close it. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className="m-0 mt-auto w-full max-w-[480px] rounded-t-[16px] border-0 bg-ground p-5 text-ink sm:mx-auto"
    >
      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-[1.25rem] font-bold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function LanguageToggle() {
  const { lang, setLang } = useT();
  const seg = (l: "en" | "id", text: string, label: string) => (
    <button
      type="button"
      aria-pressed={lang === l}
      aria-label={label}
      onClick={() => {
        setLang(l);
      }}
      className={`h-11 min-w-12 text-[0.875rem] ${lang === l ? "bg-ink font-bold text-white" : "bg-card font-semibold text-ink"}`}
    >
      {text}
    </button>
  );
  return (
    <div className="flex overflow-hidden rounded-full border border-input-border">
      {seg("en", "EN", "English")}
      {seg("id", "ID", "Bahasa Indonesia")}
    </div>
  );
}

export function TabBar({ current }: { current: "envelopes" | "card" | "activity" }) {
  const { t } = useT();
  const items = [
    {
      key: "envelopes",
      href: "/app",
      label: t("tab.envelopes"),
      icon: (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <polyline points="3,7 12,13 21,7" />
        </>
      ),
    },
    {
      key: "card",
      href: "/app/card",
      label: t("tab.card"),
      icon: (
        <>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </>
      ),
    },
    {
      key: "activity",
      href: "/app/activity",
      label: t("tab.activity"),
      icon: (
        <>
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3.5 6h.01" />
          <path d="M3.5 12h.01" />
          <path d="M3.5 18h.01" />
        </>
      ),
    },
  ] as const;
  return (
    <nav
      aria-label={t("tab.label")}
      className="sticky bottom-0 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
    >
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={current === i.key ? "page" : undefined}
          className={`flex h-[68px] flex-1 flex-col items-center justify-center gap-1 text-[0.8125rem] no-underline ${current === i.key ? "font-bold text-ink" : "font-semibold text-muted"}`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={current === i.key ? 2.4 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {i.icon}
          </svg>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function CheckLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-[0.9375rem]">
      <span className={`flex shrink-0 pt-px ${ok ? "text-ok" : "text-bad"}`}>
        {ok ? <Check size={20} aria-hidden="true" /> : <CircleX size={20} aria-hidden="true" />}
      </span>
      <div className="user-text min-w-0">{children}</div>
    </div>
  );
}

export function ProofLink({ href, what }: { href: string; what: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="tx-proof"
      aria-label={`View transaction proof for ${what}`}
      className="flex min-h-11 items-center justify-center text-[0.875rem] font-bold text-link"
    >
      View transaction proof
    </a>
  );
}

/** 06 S06-41: in the page flow above every shell screen; 15 owns its wording. */
export function DemoBanner() {
  const { t } = useT();
  if (!DEMO) return null;
  return (
    <div
      role="note"
      data-testid="demo-banner"
      className="flex min-h-8 items-center gap-2 bg-quiet px-5 py-1.5 text-[0.8125rem] text-ink"
    >
      <Info size={16} aria-hidden="true" className="shrink-0" />
      {t("banner.demo")}
    </div>
  );
}
