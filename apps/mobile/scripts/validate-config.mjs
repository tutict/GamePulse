import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../capacitor.config.json", import.meta.url), "utf8"));
const required = ["appId", "appName", "webDir"];
const missing = required.filter((key) => !config[key]);

if (missing.length > 0) {
  console.error(`Missing Capacitor config fields: ${missing.join(", ")}`);
  process.exit(1);
}

if (config.appId !== "cn.gamepulse.mobile") {
  console.error(`Unexpected appId: ${config.appId}`);
  process.exit(1);
}

if (config.server?.androidScheme !== "https") {
  console.error("Android scheme must stay https for Capacitor navigation compatibility.");
  process.exit(1);
}

console.log(`Capacitor config OK: ${config.appName} (${config.appId})`);