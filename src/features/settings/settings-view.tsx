import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useSettingsStore, THEMES } from "@/stores/settings-store";
import { useLibraryPrefs, CARD_SIZE_OPTIONS, type CardSize } from "@/stores/library-prefs-store";
import { LOCALES, type Locale } from "@/i18n";
import { clearAllData } from "@/platform/clear-data";

/** A titled group of related settings, drawn as a bordered, divided list. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</h2>
      <div className="divide-y border">{children}</div>
    </section>
  );
}

/** One setting: label + optional description on the left, its control on the right. */
function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="space-y-0.5">
        <p className="text-xs font-medium">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * App-wide preferences (rendered beside the shared sidebar by app.tsx), grouped
 * into sections. Each control reads/writes the store that owns the pref, so
 * changes stay in sync app-wide (e.g. the dark-mode toggle mirrors the reader).
 */
export function SettingsView() {
  const { t, i18n } = useTranslation();

  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const isDark = (THEMES[theme] || THEMES.sepia).dark;

  const cardSize = useLibraryPrefs((s) => s.cardSize);
  const setCardSize = useLibraryPrefs((s) => s.setCardSize);
  const showCardMetadata = useLibraryPrefs((s) => s.showCardMetadata);
  const setShowCardMetadata = useLibraryPrefs((s) => s.setShowCardMetadata);

  // Disables the button while the wipe runs; the page reloads before it
  // resolves, so this never has to be reset.
  const [clearing, setClearing] = useState(false);

  const currentLocale = (i18n.resolvedLanguage || i18n.language || "en").startsWith("vi") ? "vi" : "en";

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-auto">
      <div className="mx-auto w-full max-w-3xl space-y-8 p-6">
        <header className="space-y-1">
          <h1 className="text-lg font-medium tracking-tight">{t("settings.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("settings.subtitle")}</p>
        </header>

        <Section title={t("settings.languageSection")}>
          <SettingRow label={t("settings.language")} description={t("settings.languageDesc")}>
            <Select value={currentLocale} onValueChange={(v) => void i18n.changeLanguage(v as Locale)}>
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((loc) => (
                  <SelectItem key={loc.value} value={loc.value}>
                    {loc.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        </Section>

        <Section title={t("settings.appearance")}>
          <SettingRow label={t("settings.darkMode")} description={t("settings.darkModeDesc")}>
            <Switch checked={isDark} onCheckedChange={(v) => setTheme(v ? "dark" : "sepia")} aria-label={t("settings.darkMode")} />
          </SettingRow>
        </Section>

        <Section title={t("settings.library")}>
          <SettingRow label={t("settings.coverSize")} description={t("settings.coverSizeDesc")}>
            <Select value={cardSize} onValueChange={(v) => setCardSize(v as CardSize)}>
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CARD_SIZE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(`options.cardSize.${opt.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label={t("settings.showDetails")} description={t("settings.showDetailsDesc")}>
            <Switch checked={showCardMetadata} onCheckedChange={setShowCardMetadata} aria-label={t("settings.showDetails")} />
          </SettingRow>
        </Section>

        <Section title={t("settings.data")}>
          <SettingRow label={t("settings.clearData")} description={t("settings.clearDataDesc")}>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={clearing}>
                  <Trash2 />
                  {t("settings.clearData")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("settings.clearDataConfirmTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("settings.clearDataConfirmDesc")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      setClearing(true);
                      void clearAllData().catch((err) => {
                        console.error("Failed to clear data", err);
                        toast.error(t("settings.clearDataFailed"));
                        setClearing(false);
                      });
                    }}
                  >
                    {t("settings.clearDataAction")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </SettingRow>
        </Section>
      </div>
    </div>
  );
}
