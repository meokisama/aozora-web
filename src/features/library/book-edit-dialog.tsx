import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLibraryStore } from "@/stores/library-store";
import type { Book } from "@/lib/types";

/** Reads a File into a data URL (the web store persists covers as data URLs). */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Edit a book's title, author and cover. The chosen cover is read to a data URL
 * in the browser and handed to the store (`updateBook`), which downscales and
 * stores it — no native/main-process round-trip.
 */
export function BookEditDialog({ book, open, onOpenChange }: { book: Book; open: boolean; onOpenChange: (open: boolean) => void }) {
  const updateBook = useLibraryStore((s) => s.updateBook);
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author ?? "");
  const [cover, setCover] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset the form each time the dialog opens — the instance is reused across edits.
  useEffect(() => {
    if (open) {
      setTitle(book.title);
      setAuthor(book.author ?? "");
      setCover(null);
    }
  }, [open, book]);

  const pickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    try {
      setCover(await readAsDataUrl(file));
    } catch {
      toast.error("Failed to read image");
    }
  };

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Title can't be empty");
      return;
    }
    setSaving(true);
    try {
      await updateBook(book.id, {
        title: trimmed,
        author: author.trim(),
        ...(cover ? { coverDataUrl: cover } : {}),
      });
      toast.success("Book updated");
      onOpenChange(false);
    } catch {
      toast.error("Failed to update book");
    } finally {
      setSaving(false);
    }
  };

  const previewSrc = cover ?? book.coverDataUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-145">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>Update the title, author, or cover image.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative aspect-2/3 w-30 shrink-0 overflow-hidden border bg-muted transition-colors hover:border-foreground/30"
            aria-label="Change cover"
          >
            {previewSrc ? (
              <img src={previewSrc} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImagePlus className="size-5 text-muted-foreground" />
              </div>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              Change
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickCover} />

          <div className="flex flex-1 flex-col gap-3">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium">Title</span>
              <Textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Book title"
                className="min-h-0 flex-1 resize-none field-sizing-fixed"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium">Author</span>
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author (optional)" />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
