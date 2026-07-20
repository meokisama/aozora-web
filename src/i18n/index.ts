import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./en.json";
import vi from "./vi.json";

/** UI locales; order drives the Settings selector. English is the default/fallback. */
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
    // Collapse regional tags (vi-VN → vi) so detection lands on a base language.
    load: "languageOnly",
    detection: {
      // Priority: persisted choice > embed `?lang=` hint > browser > en. Result is
      // cached, so the hint only decides the first visit and later switches stick.
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
