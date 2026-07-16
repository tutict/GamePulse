import { describe, expect, it } from "vitest";
import { isTrustedRendererUrl } from "./security.js";

describe("renderer URL trust", () => {
  it("trusts only the packaged renderer entry for file URLs", () => {
    const rendererUrl = new URL("../renderer/index.html", import.meta.url).href;

    expect(isTrustedRendererUrl(rendererUrl)).toBe(true);
    expect(isTrustedRendererUrl("file:///C:/tmp/untrusted.html")).toBe(false);
  });
});
