import { closePool, migrate } from "./db.js";

try {
  await migrate();
  console.log("Database migration complete");
} finally {
  await closePool();
}

