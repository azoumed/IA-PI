import "server-only";
import { cookies } from "next/headers";
import { fr, type DictKey } from "./fr";
import { ar } from "./ar";

export type Locale = "fr" | "ar";
export const LOCALE_COOKIE = "lang";
export type { DictKey };

const dicts: Record<Locale, Record<DictKey, string>> = { fr, ar };

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return v === "ar" ? "ar" : "fr";
}

export type T = (key: DictKey, vars?: Record<string, string | number>) => string;

export function makeT(locale: Locale): T {
  const d = dicts[locale];
  return (key, vars) => {
    let s = d[key] ?? fr[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: makeT(locale), dir: locale === "ar" ? ("rtl" as const) : ("ltr" as const) };
}

/** Choisit la variante localisée d'un champ bilingue (ex. name / nameAr). */
export function pick(locale: Locale, latin: string | null | undefined, arabic: string | null | undefined) {
  if (locale === "ar") return arabic || latin || "";
  return latin || arabic || "";
}

export function formatDate(locale: Locale, d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : "fr-MA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    calendar: "gregory",
    numberingSystem: "latn",
  }).format(date);
}

export function formatDateTime(locale: Locale, d: Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : "fr-MA", {
    dateStyle: "short",
    timeStyle: "short",
    calendar: "gregory",
    numberingSystem: "latn",
  }).format(d);
}
