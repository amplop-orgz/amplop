import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests run with .env.example's fake values; CI may point DATABASE_URL at its service container.
const example = Object.fromEntries(
  readFileSync(fileURLToPath(new URL("../../.env.example", import.meta.url)), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const fromCi = ["DATABASE_URL", "DATABASE_MIGRATION_URL"].filter((k) => process.env[k]);

export default defineConfig({
  // tsconfig keeps JSX for Next.js; tests compile it here.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./src/", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    env: { ...example, ...Object.fromEntries(fromCi.map((k) => [k, process.env[k] ?? ""])) },
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/lib/server/**"],
      thresholds: { lines: 85 },
    },
  },
});
