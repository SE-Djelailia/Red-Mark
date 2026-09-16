import { defineConfig } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt", "icon.svg"],
      manifest: {
        name: "RedMark - Construction Photo Intelligence",
        short_name: "RedMark",
        description:
          "Document construction sites with photos, site visit logs, and generate structured reports",
        theme_color: "#E10600",
        // White, matching the icons' own ground. Was ink, which framed a
        // white-field icon in black on the PWA splash screen.
        background_color: "#FFFFFF",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        // SVG first (scales to any launcher size), with PNGs for the
        // platforms that still refuse SVG icons.
        //
        // EVERY PNG HERE IS OPAQUE WHITE, never transparent. iOS composites a
        // home-screen icon onto BLACK before rounding its corners, so a
        // transparent field renders as a black tile with a red X on it.
        //
        // "maskable" now has its OWN files rather than being claimed on the
        // "any" ones. Android crops a maskable icon to the launcher shape —
        // up to ~20% off each edge — so the maskable assets are drawn with a
        // 28% inset that keeps the whole X inside the safe zone, while the
        // "any" assets keep the tighter 20% inset that looks right uncropped.
        // One file cannot serve both: whichever purpose it is used for, the
        // other one looks wrong.
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/icons/icon-maskable-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/icon-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Nouvelle visite",
            short_name: "Visite",
            description: "Créer une nouvelle visite de site",
            url: "/app/new-visit",
            icons: [{ src: "/icon.svg", sizes: "512x512" }],
          },
          {
            name: "Mes projets",
            short_name: "Projets",
            description: "Voir tous les projets",
            url: "/app/projects",
            icons: [{ src: "/icon.svg", sizes: "512x512" }],
          },
          {
            name: "Tableau de bord",
            short_name: "Dashboard",
            description: "Vue d'ensemble des projets",
            url: "/app/dashboard",
            icons: [{ src: "/icon.svg", sizes: "512x512" }],
          },
        ],
      },
      injectManifest: {
        // The caching rules themselves now live in src/sw.ts (registerRoute
        // calls) since a custom SW source has full control; this only
        // covers which build output gets fed into self.__WB_MANIFEST.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // The demo-capture tool is an internal, unlinked route (see
        // routes.tsx) that photographs real screens for sales decks. It is
        // lazy-loaded, so keeping its chunk OUT of the precache means no
        // user ever downloads it — otherwise the service worker would fetch
        // it on install, undoing the point of splitting it. The demo/ pattern
        // also covers any captured PNGs should they ever be placed in
        // public/ again (they are not shipped today).
        globIgnores: ["**/demo/**", "**/DemoCapture-*.js"],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ["**/*.svg", "**/*.csv"],
});
