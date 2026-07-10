import { describe, expect, it } from "vitest";
import { buildFts5Query } from "./rag.js";

describe("FTS5 query building", () => {
  it("turns dangerous FTS5 syntax into literal terms", () => {
    expect(buildFts5Query('crash OR "login":* -bug NEAR(账号)')).toBe(
      '"crash" OR "login" OR "bug" OR "账号"'
    );
  });
});
