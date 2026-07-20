import { useRef } from "react";
import { Check, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { ANNOTATION_COLORS } from "@/lib/reader/annotations";
import { cn } from "@/lib/utils";
import { useAnchoredPosition } from "./hooks/use-anchored-position";
import { useDismiss } from "./hooks/use-dismiss";

interface Props {
  /** Bounding box of selection (new) or clicked highlight (editing); null closed. */
  anchor: DOMRect | null;
  color: string;
  note: string;
  /** Fresh selection (no delete affordance yet). */
  isNew: boolean;
  onColor: (key: string) => void;
  onNote: (value: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** Floating highlight editor: colour swatches + optional note. Note saved by parent on close. */
export function AnnotationPopover({ anchor, color, note, isNew, onColor, onNote, onDelete, onClose }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  // Fixed-size editor: re-place only on anchor/delete-button change, not per keystroke.
  const pos = useAnchoredPosition(ref, anchor, isNew);

  useDismiss(!!anchor, ref, onClose);

  if (!anchor) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t("reader.highlight")}
      style={{
        position: "fixed",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      className="z-50 w-64 border bg-popover p-2 text-popover-foreground shadow-md"
    >
      <div className="flex items-center gap-1">
        {ANNOTATION_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onColor(c.key)}
            aria-label={t(`options.annotationColors.${c.key}`)}
            title={t(`options.annotationColors.${c.key}`)}
            className={cn(
              "flex size-6 items-center justify-center rounded-full ring-offset-1 transition-transform hover:scale-110",
              color === c.key && "ring-2 ring-foreground/60",
            )}
            style={{ backgroundColor: c.swatch }}
          >
            {color === c.key && <Check className="size-3.5 text-black/70" />}
          </button>
        ))}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("reader.deleteHighlight")}
            title={t("reader.deleteHighlight")}
            className="ml-auto cursor-pointer flex size-6 items-center justify-center rounded-none text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      <Textarea
        value={note}
        onChange={(e) => onNote(e.target.value)}
        placeholder={isNew ? t("reader.addNoteOptional") : t("reader.addNote")}
        rows={2}
        className="mt-2 min-h-0 resize-none text-xs"
      />
    </div>
  );
}
