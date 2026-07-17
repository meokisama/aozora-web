import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

// Relative base ("./") so the built `dist/` runs from any path on a static host
// (VPS root or a sub-folder) without rewriting asset URLs. Navigation is
// state-based (no history-API routing), so relative paths are safe.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
    },
  },
});
