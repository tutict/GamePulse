import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = resolve(appDir, "android");
const task = process.argv[2] ?? "assembleDebug";
const gradle = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const gradlePath = resolve(androidDir, gradle);

if (!existsSync(androidDir) || !existsSync(gradlePath)) {
  console.error("Android project is missing. Run `npm run sync:android -w @gamepulse/mobile` first.");
  process.exit(1);
}

const child = spawn(gradlePath, [task], {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code) => process.exit(code ?? 1));