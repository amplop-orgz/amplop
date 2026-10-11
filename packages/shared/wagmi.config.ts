import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

export default defineConfig({
  out: "src/generated/amplop.ts",
  plugins: [
    foundry({
      project: "../../contracts",
      include: ["AmplopEnvelopes.sol/**"],
      forge: { build: false },
    }),
  ],
});
