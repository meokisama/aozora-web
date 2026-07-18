import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./en.json";
import vi from "./vi.json";

/** Selectable UI locales. English is the default/fallback; Vietnamese is the
 *  second locale. Order drives the Settings language selector. */
export const LOCALES = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt" },
] as const;

export type Locale = (typeof LOCALES)[number]["value"];

/** localStorage key the detector reads/writes so a manual choice sticks. */
export const LANGUAGE_STORAGE_KEY = "aozora-language";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      vi: { translation: vi },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "vi"],
    // Collapse regional tags (vi-VN, en-US…) to the base language so detection
    // of a Vietnamese browser lands on `vi` and everything else on `en`.
    load: "languageOnly",
    detection: {
      // Priority: a manual choice persisted to localStorage always wins; then a
      // `?lang=` hint from the ranobe-hub embed (its server knows the visitor's
      // locale via GeoIP/account — the reliable signal a client-only SPA can't
      // compute itself); then the browser's navigator.languages; then `en`.
      // The resolved language is cached to localStorage, so the embed hint only
      // decides the FIRST visit and a later in-app switch sticks.
      order: ["localStorage", "querystring", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      lookupQuerystring: "lang",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

/** Keep <html lang> in sync with the active locale (a11y + font selection). */
function applyHtmlLang(lng: string | undefined) {
  document.documentElement.lang = lng?.startsWith("vi") ? "vi" : "en";
}
applyHtmlLang(i18n.resolvedLanguage || i18n.language);
i18n.on("languageChanged", applyHtmlLang);

export default i18n;
