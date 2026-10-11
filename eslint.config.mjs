// One flat config for the repository (S02-6). Web rules (React Hooks, Next, react/no-danger) are
// added by spec 06 together with apps/web.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
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
    files: ["packages/shared/src/money/**", "apps/web/src/lib/server/{topup,card}/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.name='parseFloat']", message: "Money is bigint." },
        { selector: "CallExpression[callee.name='Number']", message: "Money is bigint." },
      ],
    },
  },
  prettier,
);
