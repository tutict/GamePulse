import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

const appDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve(appDir, "src/renderer"),
    publicDir: resolve(appDir, "../../packages/ui/public"),
    cacheDir: resolve(appDir, "../../node_modules/.vite/desktop-renderer"),
    resolve: {
      alias: {
        "@renderer": resolve(appDir, "src/renderer/src")
      }
    },
    plugins: [react(), tailwindcss()]
  }
});
