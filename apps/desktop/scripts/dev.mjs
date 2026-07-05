import { builtinModules } from "node:module";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build, createServer } from "vite";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: npm run dev -w @gamepulse/desktop");
  console.log("Builds Electron main/preload once, starts the renderer dev server, then launches Electron.");
  process.exit(0);
}

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(appDir, "out");
const rendererRoot = resolve(appDir, "src/renderer");
const external = [...builtinModules, ...builtinModules.map((name) => `node:${name}`), "electron", "better-sqlite3"];

async function buildMainAndPreload() {
  await build({
    configFile: false,
    root: appDir,
    publicDir: false,
    build: {
      outDir: resolve(outDir, "main"),
      emptyOutDir: true,
      minify: false,
      sourcemap: true,
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
      sourcemap: true,
      ssr: resolve(appDir, "src/preload/index.ts"),
      target: "node22",
      rollupOptions: {
        external,
        output: {
          entryFileNames: "index.mjs",
          chunkFileNames: "[name]-[hash].mjs",
          format: "es"
        }
      }
    }
  });
}

await buildMainAndPreload();

const server = await createServer({
  cacheDir: resolve(appDir, "../../node_modules/.vite/desktop-renderer"),
  configFile: false,
  root: rendererRoot,
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: false
  }
});

await server.listen();
server.printUrls();

const rendererUrl = server.resolvedUrls?.local?.[0];
if (!rendererUrl) {
  throw new Error("Renderer dev server did not expose a local URL.");
}

const electronProcess = spawn(String(electronPath), [resolve(outDir, "main/index.js")], {
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_RENDERER_URL: rendererUrl
  }
});

async function shutdown(code = 0) {
  if (!electronProcess.killed) {
    electronProcess.kill();
  }
  await server.close();
  process.exit(code);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
electronProcess.on("exit", (code) => void shutdown(code ?? 0));
