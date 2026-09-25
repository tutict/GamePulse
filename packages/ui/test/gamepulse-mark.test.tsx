// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GamePulseMark } from "../src/components/gamepulse-mark.js";

afterEach(cleanup);

describe("GamePulseMark", () => {
  it("renders the 游脉窗 mark as an accessible scalable SVG", () => {
    render(<GamePulseMark title="GamePulse 游脉" />);

    const mark = screen.getByRole("img", { name: "GamePulse 游脉" });

    expect(mark.tagName).toBe("svg");
    expect(mark.getAttribute("viewBox")).toBe("0 0 48 48");
    expect(mark.getAttribute("aria-labelledby")).toBeTruthy();
    expect(mark.querySelectorAll("path").length).toBeGreaterThanOrEqual(3);
  });
  it("keeps title references unique when multiple marks are rendered", () => {
    render(
      <>
        <GamePulseMark title="第一个游脉标志" />
        <GamePulseMark title="第二个游脉标志" />
      </>
    );

    const marks = screen.getAllByRole("img");
    const labelledBy = marks.map((mark) => mark.getAttribute("aria-labelledby"));

    expect(new Set(labelledBy).size).toBe(2);
  });
});

