import { create } from "zustand";
import { idbGetAll, idbPut, idbDelete, registerFont, unregisterFont } from "@/lib/fonts/custom-fonts";
import { FONT_STACKS, useSettingsStore, type BuiltinFont } from "@/stores/settings-store";

/**
 * User-imported reader fonts. Metadata mirrored here; font bytes live in
 * IndexedDB, registered as FontFaces (see `lib/fonts/custom-fonts.ts`).
 * Selected id lives in settings store; missing font falls back to built-in.
 */

export interface CustomFont {
  id: string;
  label: string;
  family: string;
}

interface FontsState {
  customFonts: CustomFont[];
  loaded: boolean;
  /** Loads stored fonts and registers their FontFaces. Idempotent. */
  init: () => Promise<void>;
  /** Imports a picked font file, registers it, and selects it. */
  importFromFile: (file: File) => Promise<void>;
  /** Removes an imported font (and resets selection if it was active). */
  remove: (id: string) => Promise<void>;
}

let initializing = false;

export const useFontsStore = create<FontsState>((set, get) => ({
  customFonts: [],
  loaded: false,

  init: async () => {
    if (get().loaded || initializing) return;
    initializing = true;
    try {
      const stored = await idbGetAll();
      for (const f of stored) {
        try {
          await registerFont(f.family, f.blob);
        } catch {
          // Skip a font that fails to parse; keep the rest.
        }
      }
      const customFonts = stored.map(({ id, label, family }) => ({ id, label, family }));
      set({ customFonts, loaded: true });

      // Drop a persisted selection whose font is no longer available.
      const active = useSettingsStore.getState().fontFamily;
      if (!(active in FONT_STACKS) && !customFonts.some((f) => f.id === active)) {
        useSettingsStore.getState().setFontFamily("mincho");
      }
    } finally {
      initializing = false;
    }
  },

  importFromFile: async (file) => {
    // Date.now()+random, not crypto.randomUUID (unavailable in file:// renderers).
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const family = `aoz-font-${id}`;
    const label = file.name.replace(/\.[^./\\]+$/, "") || file.name;
    await registerFont(family, await file.arrayBuffer());
    await idbPut({ id, label, family, blob: file });
    set((s) => ({ customFonts: [...s.customFonts, { id, label, family }] }));
    useSettingsStore.getState().setFontFamily(id);
  },

  remove: async (id) => {
    const font = get().customFonts.find((f) => f.id === id);
    if (font) unregisterFont(font.family);
    await idbDelete(id);
    set((s) => ({ customFonts: s.customFonts.filter((f) => f.id !== id) }));
    if (useSettingsStore.getState().fontFamily === id) {
      useSettingsStore.getState().setFontFamily("mincho");
    }
  },
}));

/** Resolves a font id to a CSS font-family stack; falls back to mincho. */
export function resolveFontStack(value: string, customFonts: CustomFont[] = []): string {
  if (value in FONT_STACKS) return FONT_STACKS[value as BuiltinFont];
  const custom = customFonts.find((f) => f.id === value);
  if (custom) return `'${custom.family}', serif`;
  return FONT_STACKS.mincho;
}
