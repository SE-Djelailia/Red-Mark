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
        background_color: "#1A1A1A",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
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
