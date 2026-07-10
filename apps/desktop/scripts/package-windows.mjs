import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { basename, dirname, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rebuild } from "@electron/rebuild";

const require = createRequire(import.meta.url);
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(appDir, "../..");
const releaseDir = resolve(appDir, "release");
const unpackedDir = resolve(releaseDir, "win-unpacked");
const appPayloadDir = resolve(unpackedDir, "resources", "app");
const isDirBuild = process.argv.includes("--dir");
const productName = "\u6e38\u8109 GamePulse";
const executableName = "GamePulse.exe";
const electronVersion = "43.0.0";
const runtimeDependencies = {
  "better-sqlite3": require("better-sqlite3/package.json").version
};

await packageUnpackedApp();

if (isDirBuild) {
  console.log(`Windows unpacked app written to: ${unpackedDir}`);
  process.exit(0);
}

runElectronBuilderForInstallers();

async function packageUnpackedApp() {
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

  rmSync(appPayloadDir, { recursive: true, force: true });
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
        productName,
        dependencies: runtimeDependencies
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log("Staging better-sqlite3 source...");
  copyPackage("better-sqlite3");
  console.log(`Building better-sqlite3 from source for Electron ${electronVersion}...`);
  await rebuild({
    buildPath: appPayloadDir,
    projectRootPath: appPayloadDir,
    electronVersion,
    platform: "win32",
    arch: "x64",
    onlyModules: ["better-sqlite3"],
    force: true,
    mode: "sequential",
    useCache: false,
    buildFromSource: true
  });
  console.log("Electron native rebuild completed.");
  copyPackage("bindings");
  copyPackage("file-uri-to-path");

  const nativeBinding = resolve(
    appPayloadDir,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node"
  );
  if (!existsSync(nativeBinding)) {
    throw new Error(`Electron better-sqlite3 binding is missing after rebuild: ${nativeBinding}`);
  }
}

function copyPackage(packageName) {
  const packageJsonPath = findPackageJsonPath(packageName);
  const sourceDirectory = dirname(packageJsonPath);
  const targetDirectory = resolve(appPayloadDir, "node_modules", ...packageName.split("/"));
  mkdirSync(dirname(targetDirectory), { recursive: true });
  cpSync(sourceDirectory, targetDirectory, { recursive: true, force: true });
}

function findPackageJsonPath(packageName) {
  let current = dirname(require.resolve(packageName));
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

  throw new Error(`Unable to locate package.json for runtime dependency: ${packageName}`);
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
