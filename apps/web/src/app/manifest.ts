import type { MetadataRoute } from "next";

// 06 S06-1. No description mentions crypto.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Amplop",
    short_name: "Amplop",
    id: "/app",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    theme_color: "#F2F3EE",
    background_color: "#F2F3EE",
    lang: "en",
    icons: [
      { src: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { src: "/icon-maskable-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
