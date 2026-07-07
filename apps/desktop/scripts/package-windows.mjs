import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const releaseDir = resolve(appDir, "release");
const unpackedDir = resolve(releaseDir, "win-unpacked");
const appPayloadDir = resolve(unpackedDir, "resources", "app");
const isDirBuild = process.argv.includes("--dir");
const productName = "\u6e38\u8109 GamePulse";
const executableName = "GamePulse.exe";

packageUnpackedApp();

if (isDirBuild) {
  console.log(`Windows unpacked app written to: ${unpackedDir}`);
  process.exit(0);
}

runElectronBuilderForInstallers();

function packageUnpackedApp() {
  const electronPackageDir = dirname(require.resolve("electron/package.json"));
  const electronDistDir = resolve(electronPackageDir, "dist");
  const electronExe = resolve(electronDistDir, "electron.exe");
  const sourceOutDir = resolve(appDir, "out");

  if (!existsSync(sourceOutDir)) {
    throw new Error("Desktop build output is missing. Run npm run build -w @gamepulse/desktop first.");
  }

  if (!existsSync(electronExe)) {
    throw new Error([
      "Electron runtime is missing at node_modules/electron/dist/electron.exe.",
      "Run `npm rebuild electron --cache .npm-cache` or approve npm install scripts, then retry `npm run desktop:dist:windows:dir`.",
      "The packaging script intentionally does not trigger an implicit runtime download, so CI/local failures are visible and deterministic."
    ].join("\n"));
  }

  rmSync(unpackedDir, { recursive: true, force: true });
  mkdirSync(unpackedDir, { recursive: true });
  cpSync(electronDistDir, unpackedDir, { recursive: true, force: true });

  const sourceExe = resolve(unpackedDir, basename(electronExe));
  const targetExe = resolve(unpackedDir, executableName);
  if (existsSync(sourceExe) && sourceExe !== targetExe) {
    rmSync(targetExe, { force: true });
    renameSync(sourceExe, targetExe);
  }

  mkdirSync(appPayloadDir, { recursive: true });
  cpSync(sourceOutDir, resolve(appPayloadDir, "out"), { recursive: true, force: true });
  writeFileSync(
    resolve(appPayloadDir, "package.json"),
    JSON.stringify(
      {
        name: "gamepulse-desktop",
        version: readDesktopVersion(),
        private: true,
        type: "module",
        main: "./out/main/index.js",
        productName
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

function readDesktopVersion() {
  return require(resolve(appDir, "package.json")).version ?? "0.1.0";
}

function runElectronBuilderForInstallers() {
  const builderCli = require.resolve("electron-builder/cli.js");
  const cacheDir = resolve(repoRoot, ".cache", "electron-builder");
  const nativeHomeDir = resolve(repoRoot, ".cache", "native-home");
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(nativeHomeDir, { recursive: true });

  const child = spawn(process.execPath, [builderCli, "--win", "--x64", "--prepackaged", unpackedDir], {
    cwd: appDir,
    env: {
      ...process.env,
      ELECTRON_BUILDER_CACHE: cacheDir,
      electron_config_cache: resolve(repoRoot, ".cache", "electron"),
      HOME: nativeHomeDir,
      USERPROFILE: nativeHomeDir
    },
    stdio: "inherit",
    shell: false
  });

  child.on("exit", (code) => process.exit(code ?? 1));
}