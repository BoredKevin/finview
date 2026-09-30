import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const currentDir = typeof import.meta.dirname !== "undefined" ? import.meta.dirname : process.cwd();

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
  resolve: {
    alias: {
      "@finview/crypto": path.resolve(currentDir, "./packages/crypto/src/index.ts"),
      "@finview/dsl": path.resolve(currentDir, "./packages/dsl/index.ts"),
      "@": path.resolve(currentDir, "./apps/web/src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  worker: {
    format: "es",
  },
  build: {
    outDir: "dist-web",
    target: "esnext",
  },
});
