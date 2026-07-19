import { Trans, useTranslation } from "react-i18next";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import dicShot from "@/assets/dic-shot.png";

/** Where to get the Yomitan browser extension this web edition relies on. */
const YOMITAN_URL = "https://yomitan.wiki/";

/**
 * Dictionary page: a UI-only showcase. It explains that the original desktop
 * Aozora bundles a Yomitan-compatible pop-up dictionary, while this web edition
 * has no dictionary of its own and instead works directly with the Yomitan
 * browser extension. Nothing here is interactive beyond the "get Yomitan" link.
 */
export function DictionaryView() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 py-12 text-center">
        <header className="space-y-1">
          <h1 className="text-lg font-medium tracking-tight">{t("dictionary.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("dictionary.subtitle")}</p>
        </header>

        <figure className="w-full space-y-2">
          <img
            src={dicShot}
            alt={t("dictionary.shotCaption")}
            className="w-full rounded-md border object-contain shadow-sm"
            draggable={false}
          />
          <figcaption className="text-[11px] text-muted-foreground">{t("dictionary.shotCaption")}</figcaption>
        </figure>

        <div className="space-y-3 text-sm/relaxed text-foreground/90">
          <p>
            <Trans i18nKey="dictionary.intro">
              <span className="font-semibold" />
            </Trans>
          </p>
          <p>
            <Trans i18nKey="dictionary.web">
              <span className="font-semibold" />
            </Trans>
          </p>
        </div>

        <Button variant="outline" size="sm" asChild>
          <a href={YOMITAN_URL} target="_blank" rel="noopener noreferrer">
            <BookOpen className="size-3.5" />
            {t("dictionary.getYomitan")}
          </a>
        </Button>
      </div>
    </div>
  );
}
