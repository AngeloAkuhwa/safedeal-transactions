import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      // The guarded wrapper in src/pwa/register-sw.ts is the only registrar.
      injectRegister: null,
      filename: "sw.js",
      devOptions: { enabled: false },
      // manifest.webmanifest is hand-authored in public/ and linked from index.html.
      manifest: false,
      includeAssets: [],
      workbox: {
        globDirectory: "dist",
        globPatterns: ["**/*.{js,css,woff2}", "icons/*.png", "favicon.svg", "manifest.webmanifest"],
        // Admin surfaces are large and internal-only — never precached.
        globIgnores: ["**/Admin*.js", "**/admin/**", "**/node_modules/**"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/admin/, /^\/functions\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Money, balances and transaction state must never be served stale.
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/functions/") || url.hostname.endsWith("supabase.co"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url }) => url.hostname === "res.cloudinary.com",
            handler: "CacheFirst",
            options: {
              cacheName: "sd-cloudinary-images",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "sd-navigations",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: ({ url, request }) =>
              url.origin === self.location.origin &&
              (request.destination === "script" ||
                request.destination === "style" ||
                request.destination === "font"),
            handler: "CacheFirst",
            options: {
              cacheName: "sd-static-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
