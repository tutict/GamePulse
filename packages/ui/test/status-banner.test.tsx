// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBanner } from "../src/components/status-banner.js";

afterEach(cleanup);

describe("StatusBanner", () => {
  it("announces errors as alerts without relying on color", () => {
    render(<StatusBanner tone="error">模型连接失败，请检查地址后重试。</StatusBanner>);

    expect(screen.getByRole("alert").textContent).toContain("模型连接失败，请检查地址后重试。");
  });

  it("announces non-error updates politely with visible text", () => {
    render(<StatusBanner tone="success">已保存模型设置。</StatusBanner>);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("已保存模型设置。");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });
});
