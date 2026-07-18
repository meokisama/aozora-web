import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist/", "node_modules/"]),

  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"] },
  tseslint.configs.recommended,

  // Allow intentionally-unused identifiers when prefixed with `_`
  // (e.g. positional params kept for signature compatibility).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },

  // Node: root config files
  {
    files: ["*.{ts,mts,cts}", "vite*.config.ts"],
    languageOptions: { globals: globals.node },
  },
  // Browser: app source
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },

  pluginReact.configs.flat.recommended,
  pluginReact.configs.flat["jsx-runtime"], // React 19: disable react-in-jsx-scope
  { settings: { react: { version: "19" } } },
]);
