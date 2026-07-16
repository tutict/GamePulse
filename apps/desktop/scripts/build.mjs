import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(appDir, "out");
const rendererRoot = resolve(appDir, "src/renderer");
const external = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  "electron",
  "better-sqlite3"
];

await build({
  configFile: false,
  root: appDir,
  publicDir: false,
  build: {
    outDir: resolve(outDir, "main"),
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    ssr: resolve(appDir, "src/main/index.ts"),
    target: "node22",
    rollupOptions: {
      external,
      output: {
        entryFileNames: "index.js",
        chunkFileNames: "[name]-[hash].js",
        format: "es"
      }
    }
  }
});

await build({
  configFile: false,
  root: appDir,
  publicDir: false,
  build: {
    outDir: resolve(outDir, "preload"),
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    ssr: resolve(appDir, "src/preload/index.ts"),
    target: "node22",
    rollupOptions: {
      external,
      output: {
        entryFileNames: "index.cjs",
        chunkFileNames: "[name]-[hash].cjs",
        format: "cjs"
      }
    }
  }
});

await build({
  base: "./",
  cacheDir: resolve(appDir, "../../node_modules/.vite/desktop-renderer"),
  configFile: false,
  root: rendererRoot,
  publicDir: resolve(appDir, "../../packages/ui/public"),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(outDir, "renderer"),
    emptyOutDir: true,
    target: "chrome124",
    rollupOptions: {
      input: resolve(rendererRoot, "index.html")
    }
  }
});
