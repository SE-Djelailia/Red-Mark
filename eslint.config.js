import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "dev-dist", "node_modules", "src/imports", "supabase/functions"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // A `//` comment in JSX children position is NOT a comment — it is a text
      // node, and React renders it to the screen. Neither tsc nor the build can
      // see this (it is valid JSX text), and it shipped to production once
      // during the design rollout: every visit row rendered the literal string
      // "// Phase is metadata, not an alert...". Only a lint rule catches it.
      "react/jsx-no-comment-textnodes": "error",
      /**
       * No emoji in rendered output.
       *
       * Emoji are an off-system mechanism no colour sweep can catch: the
       * notification panel shipped purple icons for months because 👤 and 💬
       * render lavender in the platform emoji font — there was no class and
       * no hex for a grep to find. They also bring their own weight, corner
       * radius and palette, none of which the design system controls.
       *
       * Scoped to JSX text and to string literals inside JSX expressions, so
       * console.log("❌ ...") and code comments — neither of which reaches a
       * user — stay allowed. Use a lucide or RedMark icon instead.
       *
       * The class covers the pictographic blocks plus the dingbats that were
       * actually found in this codebase (✓ ✔ ✕ ✖ ⚠ ✅ ❌).
       */
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXText[value=/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{FE0F}]/u]",
          message:
            "No emoji in rendered JSX. Use a lucide icon or a RedMark glyph — emoji carry their own colour and weight, which the design system cannot control.",
        },
        {
          selector:
            "JSXExpressionContainer Literal[value=/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{FE0F}]/u]",
          message:
            "No emoji in rendered JSX. Use a lucide icon or a RedMark glyph — emoji carry their own colour and weight, which the design system cannot control.",
        },
        {
          /**
           * `return "👤"` from a helper — the exact shape that shipped the
           * purple notification icons. The emoji never appears in JSX, so
           * the two selectors above cannot see it; it is only rendered once
           * the helper's result lands in a JSX expression.
           *
           * Excluding CallExpression arguments keeps console.error("❌ …")
           * legal, which is where almost every remaining emoji in this repo
           * lives.
           */
          selector:
            "ReturnStatement > Literal[value=/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{FE0F}]/u]",
          message:
            "No emoji returned for rendering. Use a lucide icon or a RedMark glyph — emoji carry their own colour and weight, which the design system cannot control.",
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Dev-only PWA icon generator, not part of the product surface: its
    // emoji are instructions to a developer, not UI a client ever sees.
    files: ["src/app/components/IconGenerator.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
  eslintConfigPrettier,
);
