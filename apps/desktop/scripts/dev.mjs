import { builtinModules } from "node:module";
import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rebuild } from "@electron/rebuild";
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
const repoRoot = resolve(appDir, "../..");
const electronNativeRoot = resolve(appDir, ".electron-dev");
const outDir = resolve(appDir, "out");
const rendererRoot = resolve(appDir, "src/renderer");
const external = [...builtinModules, ...builtinModules.map((name) => `node:${name}`), "electron"];
const rootRequire = createRequire(resolve(repoRoot, "package.json"));

await prepareElectronNativeModule();

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
          entryFileNames: "index.cjs",
          chunkFileNames: "[name]-[hash].cjs",
          format: "cjs"
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
    ELECTRON_RENDERER_URL: rendererUrl,
    GAMEPULSE_ELECTRON_NATIVE_MODULES: electronNativeRoot
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

async function prepareElectronNativeModule() {
  const electronVersion = rootRequire("electron/package.json").version;
  const sourcePackageJson = findPackageJsonPath("better-sqlite3");
  const sourceDirectory = dirname(sourcePackageJson);
  const packageVersion = JSON.parse(readFileSync(sourcePackageJson, "utf8")).version;
  const localModules = resolve(electronNativeRoot, "node_modules");
  const targetDirectory = resolve(localModules, "better-sqlite3");
  const nativeBinding = resolve(targetDirectory, "build", "Release", "better_sqlite3.node");
  const markerPath = resolve(localModules, ".gamepulse-electron-native.json");
  const marker = JSON.stringify({ electronVersion, packageVersion, arch: process.arch });

  if (
    existsSync(nativeBinding) &&
    existsSync(markerPath) &&
    readFileSync(markerPath, "utf8") === marker
  ) {
    return;
  }

  console.log(`Preparing better-sqlite3 ${packageVersion} for Electron ${electronVersion}...`);
  mkdirSync(localModules, { recursive: true });
  writeFileSync(
    resolve(electronNativeRoot, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: { "better-sqlite3": packageVersion }
    }),
    "utf8"
  );
  rmSync(targetDirectory, { recursive: true, force: true });
  cpSync(sourceDirectory, targetDirectory, { recursive: true, force: true });
  await rebuild({
    buildPath: electronNativeRoot,
    projectRootPath: electronNativeRoot,
    electronVersion,
    platform: process.platform,
    arch: process.arch,
    onlyModules: ["better-sqlite3"],
    force: true,
    mode: "sequential",
    useCache: false,
    buildFromSource: true
  });
  if (!existsSync(nativeBinding)) {
    throw new Error("Electron better-sqlite3 binding was not created");
  }
  writeFileSync(markerPath, marker, "utf8");
}

function findPackageJsonPath(packageName) {
  let current = dirname(rootRequire.resolve(packageName));
  const root = parse(current).root;
  while (current !== root) {
    const candidate = resolve(current, "package.json");
    if (existsSync(candidate)) {
      const packageJson = JSON.parse(readFileSync(candidate, "utf8"));
      if (packageJson.name === packageName) {
        return candidate;
      }
    }
    current = dirname(current);
  }
  throw new Error(`Unable to locate package.json for ${packageName}`);
}

