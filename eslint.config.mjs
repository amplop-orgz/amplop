// One flat config for the repository (S02-6), with the web rules of S02-6 and specs 05 and 06.
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.astro/**",
      "**/node_modules/**",
      "contracts/lib/**",
      "contracts/out/**",
      "contracts/cache/**",
      "contracts/broadcast/**",
      "packages/shared/src/generated/**",
      "packages/shared/abi/**",
      "indexer/generated/**",
      "specs/design/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 10,
        },
      ],
    },
  },
  {
    // The indexer is its own pnpm project with generated types (16 S16-18); it is type-checked by its
    // own tsc, so lint here skips the rules that need its types.
    files: ["indexer/**/*.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    rules: {
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-console": "error",
    },
  },
  {
    files: ["scripts/**", "**/scripts/**", "contracts/script/**", "apps/web/src/lib/server/log/**"],
    rules: { "no-console": "off" },
  },
  {
    files: ["packages/shared/src/money.ts", "apps/web/src/lib/server/{topup,card}/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.name='parseFloat']", message: "Money is bigint." },
        { selector: "CallExpression[callee.name='Number']", message: "Money is bigint." },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks, "@next/next": nextPlugin },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    settings: { react: { version: "19.3" }, next: { rootDir: "apps/web" } },
    rules: {
      ...nextPlugin.configs["core-web-vitals"].rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react/no-danger": "error",
    },
  },
  {
    // Playwright's fixture `use` is not a React hook.
    files: ["apps/web/e2e/**"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // 05 S05-37: no string-built SQL in the app.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='sql'][property.name='raw']",
          message: "sql.raw is forbidden (S05-37).",
        },
      ],
    },
  },
  {
    // 06 Security: the passkey key never touches storage or the console.
    files: ["apps/web/src/lib/client/account/**"],
    rules: {
      "no-restricted-globals": ["error", "localStorage", "sessionStorage", "indexedDB"],
      "no-restricted-properties": ["error", { object: "document", property: "cookie" }],
    },
  },
  {
    // 06 S06-16a: keep.ts alone stores the encrypted session copy, its non-extractable key in IndexedDB.
    files: ["apps/web/src/lib/client/account/keep.ts"],
    rules: {
      "no-restricted-globals": ["error", "localStorage", "sessionStorage"],
    },
  },
  prettier,
);
