import Database from "better-sqlite3";
import { runLocalStoreContract } from "../../../../packages/shared/test/localStoreContract.js";
import {
  CapacitorSqliteLocalStore,
  type MobileSqlDriver
} from "./capacitorSqliteStore.js";

class BetterSqliteTestDriver implements MobileSqlDriver {
  private database: Database.Database | undefined;

  async open(): Promise<void> {
    this.database = new Database(":memory:");
    this.database.pragma("foreign_keys = ON");
  }

  async close(): Promise<void> {
    this.database?.close();
    this.database = undefined;
  }

  async execute(statements: string): Promise<void> {
    this.requireDatabase().exec(statements);
  }

  async run(statement: string, values: unknown[] = []): Promise<number> {
    return this.requireDatabase().prepare(statement).run(...values).changes;
  }

  async query<T extends Record<string, unknown>>(
    statement: string,
    values: unknown[] = []
  ): Promise<T[]> {
    return this.requireDatabase().prepare(statement).all(...values) as T[];
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const database = this.requireDatabase();
    database.exec("BEGIN");
    try {
      const result = await operation();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  private requireDatabase(): Database.Database {
    if (!this.database) {
      throw new Error("Test database is not open");
    }
    return this.database;
  }
}

runLocalStoreContract("Android Capacitor SQLite", async () => {
  const store = new CapacitorSqliteLocalStore(new BetterSqliteTestDriver());
  await store.initialize();
  return store;
});
