import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "supabase/functions/**/*.{test,spec}.ts"],
    // Deno-only suites (remote https imports) cannot run under the Vite ESM loader.
    exclude: ["**/node_modules/**", "**/dist/**", "supabase/functions/**/pricing.parity.test.ts"],
    // react-router v7 ships ESM that expects React's ESM named exports; inline
    // it so Vite handles the CJS interop for component mount tests.
    server: { deps: { inline: ["react-router", "react-router-dom"] } },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
