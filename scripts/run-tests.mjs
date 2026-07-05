import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const roots = ["packages", "apps"];
const ignoredDirectories = new Set(["node_modules", "dist", "out", "build", "coverage", ".git", ".cache"]);
const testFiles = [];

async function collectTests(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        await collectTests(path);
      }
      continue;
    }

    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
      testFiles.push(path);
    }
  }
}

for (const root of roots) {
  await collectTests(root);
}

const normalizedFiles = testFiles.sort().map((file) => relative(process.cwd(), file).replaceAll("\\", "/"));

if (normalizedFiles.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

process.argv = [
  process.execPath,
  "vitest",
  "run",
  ...normalizedFiles
];

await import(pathToFileURL(join(process.cwd(), "node_modules/vitest/vitest.mjs")).href);
