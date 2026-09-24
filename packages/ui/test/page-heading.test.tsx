// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeading } from "../src/components/page-heading.js";

afterEach(cleanup);

describe("PageHeading", () => {
  it("forwards its ref without requiring a global DOM id", () => {
    const ref = createRef<HTMLHeadingElement>();
    const { container } = render(<PageHeading ref={ref}>报告标题</PageHeading>);

    expect(ref.current).toBe(container.querySelector("h2"));
    expect(ref.current?.id).toBe("");
  });
});
