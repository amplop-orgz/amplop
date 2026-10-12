// The app shell (06 S06-6 to S06-10, S06-41, S06-47, S06-51): language, chat-app gate, demo banner,
// route guard and unlock sheet around every /app, /invite, /approve and /recover page.
"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { DemoBanner, InlineMessage, Toaster } from "@/components/ui";
import { refreshRole, useSession } from "@/lib/client/account";
import { api, ApiError, type CallOpts } from "@/lib/client/api";
import { isChatAppBrowser } from "@/lib/client/browser";
import { CHAIN_ID } from "@/lib/client/env";
import { decideRoute, guardFor, type Role } from "@/lib/client/guard";
import { LangProvider, useT } from "@/lib/client/i18n";
import { listenForWrites } from "@/lib/client/query";
import { readItem, writeItem } from "@/lib/client/storage";
import { Gate } from "./Gate";
import { UnlockSheet } from "./UnlockSheet";

const PARENT_TEXT = /^\/(app\/parent|invite\/|approve\/|recover\/)/;

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <LangProvider>
      <div
        className={`mx-auto flex min-h-dvh w-full max-w-[480px] flex-col ${PARENT_TEXT.test(path) ? "parent-text" : ""}`}
      >
        <Frame>{children}</Frame>
      </div>
    </LangProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const [gate, setGate] = useState(false);
  useEffect(() => {
    setGate(
      isChatAppBrowser(navigator.userAgent) && readItem("session", "amplop.gateSkip") !== "1",
    );
  }, []);
  useEffect(() => listenForWrites(), []);
  useEffect(() => {
    // S06-20: a removed trusted person loses access on their next focus.
    const onFocus = () => {
      void refreshRole().catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  if (gate) {
    return (
      <Gate
        onSkip={() => {
          writeItem("session", "amplop.gateSkip", "1");
          setGate(false);
        }}
      />
    );
  }
  return (
    <>
      <DemoBanner />
      <TestHooks />
      <Guard>{children}</Guard>
      <Toaster />
    </>
  );
}

function Guard({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { t } = useT();
  const { session, role } = useSession();
  // A page whose guard ignores the role stays mounted while the role loads, so a sign-in made on it
  // (Welcome, /recover) does not remount it mid-flow and lose its state.
  const ready =
    session === null ||
    (role !== "loading" && role !== "error") ||
    (role === "loading" && guardFor(path) === "none");
  const decision = ready
    ? decideRoute(path, { session: session ? { role: role as Role } : null })
    : null;
  const redirect = decision && "redirect" in decision ? decision.redirect : null;
  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);
  if (session && role === "error") {
    return (
      <div className="p-5">
        <InlineMessage
          kind="offline"
          onRetry={() => {
            void refreshRole().catch(() => undefined);
          }}
        >
          {t("error.offline")}
        </InlineMessage>
      </div>
    );
  }
  if (!decision) return <div className="p-5 text-muted">{t("common.loading")}</div>;
  if ("unlock" in decision) return <UnlockSheet />;
  if ("redirect" in decision) return null; // S06-9: a refused page renders nothing
  return <>{children}</>;
}

type CallAction = NonNullable<CallOpts["auth"]>["action"];

/** S06-51: test hooks, only on the local test chain. `signedGet` lets 14's J4 call the API as this profile. */
function TestHooks() {
  const { session, role } = useSession();
  useEffect(() => {
    if (CHAIN_ID !== 31337) return;
    const accountId =
      typeof role === "object" ? (role.studentAccountId ?? role.trustedAccountId ?? null) : null;
    Object.defineProperty(window, "__amplopTest", {
      value: Object.freeze({
        address: session?.address ?? null,
        accountId: accountId?.toString() ?? null,
        signedGet: async (path: string, action: string, forAccount: string) => {
          try {
            const body = await api.get<unknown>(path, {
              auth: { action: action as CallAction, accountId: BigInt(forAccount) },
            });
            return { status: 200, body };
          } catch (e) {
            return { status: e instanceof ApiError ? e.status : 0, body: null };
          }
        },
      }),
      configurable: true,
      writable: false,
    });
  }, [session, role]);
  return null;
}
