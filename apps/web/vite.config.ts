import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const appDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: appDir,
  cacheDir: resolve(appDir, "../../node_modules/.vite/web"),
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173
  },
  preview: {
    port: 5173
  }
});
