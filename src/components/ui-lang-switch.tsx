/**
 * Choix FR / EN de l'espace posteur, partagé par toute la page.
 * Les pages d'administration ne l'utilisent pas : elles restent en français.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { formatDay, useUiLang, type UiLang } from "@/lib/ui-lang";

type Ctx = {
  lang: UiLang;
  setLang: (l: UiLang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  day: (iso: string) => string;
};

const UiLangContext = createContext<Ctx | null>(null);

export function UiLangProvider({ children }: { children: ReactNode }) {
  const { lang, setLang, t } = useUiLang();
  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t, day: (iso: string) => formatDay(iso, lang) }),
    [lang, setLang, t],
  );
  return <UiLangContext.Provider value={value}>{children}</UiLangContext.Provider>;
}

export function useUi(): Ctx {
  const ctx = useContext(UiLangContext);
  if (!ctx) throw new Error("useUi doit être utilisé dans un UiLangProvider.");
  return ctx;
}

export function UiLangSwitch() {
  const { lang, setLang } = useUi();
  return (
    <div className="flex shrink-0 items-center rounded-md border border-border p-0.5">
      {(["fr", "en"] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => setLang(id)}
          aria-pressed={lang === id}
          className={`rounded px-2 py-1 text-xs font-medium uppercase transition-colors ${
            lang === id
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {id}
        </button>
      ))}
    </div>
  );
}
