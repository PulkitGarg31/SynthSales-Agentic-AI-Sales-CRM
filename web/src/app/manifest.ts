import type { MetadataRoute } from "next";

// Web App Manifest (PWA install metadata). Next serves this at /manifest.webmanifest
// and wires the <link rel="manifest"> tag automatically. Icons live in /public/brand;
// colors match the cream/ink design tokens in globals.css.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SynthSales",
    short_name: "SynthSales",
    description: "Outreach that researches itself. You approve every send.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4efe6",
    theme_color: "#f4efe6",
    icons: [
      {
        src: "/brand/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
