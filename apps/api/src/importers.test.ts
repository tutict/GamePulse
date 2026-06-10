import { describe, expect, it } from "vitest";
import { parseImportPayload } from "./importers.js";

describe("import parsing", () => {
  it("maps CSV aliases into ingest items", () => {
    const rows = parseImportPayload(
      "csv",
      "platform,content,url,author,likes\nsteam,更新后闪退要退坑,http://example.test/a,Alice,12",
      "import"
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.platform).toBe("steam");
    expect(rows[0]?.body).toContain("闪退");
    expect(rows[0]?.sourceUrl).toBe("http://example.test/a");
    expect(rows[0]?.upvotes).toBe(12);
  });

  it("maps JSON arrays", () => {
    const rows = parseImportPayload("json", JSON.stringify([{ source: "小黑盒", text: "优化不错" }]), "import");

    expect(rows[0]?.platform).toBe("heybox");
    expect(rows[0]?.body).toBe("优化不错");
  });
});

