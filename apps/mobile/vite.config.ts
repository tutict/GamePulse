import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const appDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  publicDir: resolve(appDir, "../../packages/ui/public"),
  plugins: [react(), tailwindcss()],
  build: {
    target: "es2022"
  }
});
