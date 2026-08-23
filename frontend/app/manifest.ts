import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Recall Forge",
    short_name: "Recall Forge",
    description: "Adaptive times tables retrieval practice",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f8fb",
    theme_color: "#2563eb",
    orientation: "any",
    icons: [
      {
        src: "/assets/creatures/blob-champion.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/assets/creatures/blob-champion.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
