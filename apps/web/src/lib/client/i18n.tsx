// English and Bahasa Indonesia (06 S06-34): one small helper with {name} placeholders. User-typed text
// is passed in as a value and never translated; money formats do not change with the language.
"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "../../../messages/en.json";
import id from "../../../messages/id.json";
import { readItem, writeItem } from "./storage";

export type Lang = "en" | "id";
export type Key = keyof typeof en | keyof typeof import("../../../messages/demo.en.json");

type Messages = Record<string, string>;
// 15 S15-15: the demo controls' copy is bundled only when NEXT_PUBLIC_DEMO_MODE is "true" at build
// time; otherwise this branch, and the files it requires, are dropped from the bundle.
const DEMO_MESSAGES: { en: Messages; id: Messages } =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true"
    ? {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import is always bundled
        en: require("../../../messages/demo.en.json") as Messages,
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import is always bundled
        id: require("../../../messages/demo.id.json") as Messages,
      }
    : { en: {}, id: {} };

const MESSAGES: Record<Lang, Messages> = {
  en: { ...en, ...DEMO_MESSAGES.en },
  id: { ...id, ...DEMO_MESSAGES.id },
};

export function format(
  lang: Lang,
  key: string,
  vars: Record<string, string | number> = {},
): string {
  const text = MESSAGES[lang][key] ?? MESSAGES.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export function hasKey(key: string): boolean {
  return key in MESSAGES.en;
}

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
};

const I18n = createContext<Ctx>({
  lang: "en",
  setLang: () => undefined,
  t: (k) => format("en", k),
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    const saved = readItem("local", "amplop.lang");
    if (saved === "id" || saved === "en") setLangState(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    writeItem("local", "amplop.lang", l);
    setLangState(l);
  }, []);
  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t: (key, vars) => format(lang, key, vars) }),
    [lang, setLang],
  );
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useT(): Ctx {
  return useContext(I18n);
}
