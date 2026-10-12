// The docs site (18 S18-12): Astro Starlight with the links validator, so a broken internal link fails
// the build.
import starlight from "@astrojs/starlight";
import { defineConfig, passthroughImageService } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

const repo = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/amplop-orgz/amplop";

export default defineConfig({
  site: process.env.NEXT_PUBLIC_DOCS_URL || undefined,
  // Images are hand-made SVG; no image processing is needed.
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: "Amplop docs",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "Source code", href: repo }],
      editLink: { baseUrl: `${repo}/edit/main/apps/docs/` },
      lastUpdated: true,
      customCss: ["@fontsource-variable/plus-jakarta-sans", "./src/styles/theme.css"],
      plugins: [starlightLinksValidator()],
      sidebar: [
        "index",
        "try-it",
        "user-guide",
        "architecture",
        "contracts",
        "api",
        "issuer-integration",
        "trust-and-security",
        "how-amplop-differs",
        "roadmap",
      ],
    }),
  ],
});
