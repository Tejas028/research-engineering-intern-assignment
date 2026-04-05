import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,          // disable sourcemaps in prod to reduce bundle size
    chunkSizeWarningLimit: 800, // recharts + d3 together exceed vite's default 500KB warning
  },
  server: {
    proxy: {
      "/api":    "http://localhost:8000",
      "/static": "http://localhost:8000",
    },
  },
});
