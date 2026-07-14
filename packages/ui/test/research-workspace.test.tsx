// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);
import { ResearchWorkspace } from "../src/features/research/research-workspace.js";
import type { ResearchWorkspaceModel } from "../src/features/research/types.js";

const startModel: ResearchWorkspaceModel = {
  screen: "start",
  recent: [],
  mode: "fixture",
  credentialsReady: false
};

const reportModel: ResearchWorkspaceModel = {
  screen: "report",
  report: {
    researchId: "research-1",
    gameName: "幻兽帕鲁",
    focus: "联机稳定性",
    version: 1,
    updatedAt: "2026-07-13T00:00:00.000Z",
    verdict: "固定验证样本中的风评较为分化，优势与风险同时存在。",
    summary: "样本内正面 43%、中性 29%、负面 28%，这些比例不代表全体玩家。",
    positiveRate: 43,
    neutralRate: 29,
    negativeRate: 28,
    topics: [
      {
        id: "stability",
        label: "联机与运行稳定性",
        sentiment: "mixed",
        summary: "多人联机体验有吸引力，但断线和延迟仍被反复提及。",
        evidenceIds: ["evidence-1"]
      }
    ],
    strengths: ["合作建造和探索循环仍有吸引力。"],
    risks: ["长时间联机会出现断线。"],
    controversies: ["不同设备上的稳定性体验差异较大。"],
    coverage: {
      coveredSources: 4,
      failedSources: 1,
      excludedSources: 0,
      evidenceCount: 7
    }
  },
  evidence: [
    {
      id: "evidence-1",
      sourceId: "source-1",
      citationLabel: "E1",
      platform: "steam",
      sourceTitle: "幻兽帕鲁 - Steam 固定验证样本",
      sourceUrl: "https://fixtures.gamepulse.local/steam",
      excerpt: "多人联机仍会偶发断线。",
      body: "最近补丁后多人联机仍会偶发断线，长时间游玩时也能感到帧率波动。",
      postedAt: "2026-07-09T08:00:00.000Z",
      sentiment: "negative",
      relevance: 0.96,
      fixture: true
    }
  ]
};

describe("ResearchWorkspace", () => {
  it("sizes the mobile navigation from the three actual destinations", () => {
    render(<ResearchWorkspace model={startModel} />);
    const navigation = screen.getAllByRole("navigation", { name: "Primary" }).at(-1)!;
    const grid = navigation.firstElementChild as HTMLElement;

    expect(grid.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
  });
  it("starts research from a manually entered game name and optional focus", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<ResearchWorkspace model={startModel} onStart={onStart} />);

    await user.type(screen.getByLabelText("游戏名称"), "  幻兽帕鲁  ");
    await user.type(screen.getByLabelText("重点关注的问题（可选）"), "  联机稳定性  ");
    await user.click(screen.getByRole("button", { name: "开始研究" }));

    expect(onStart).toHaveBeenCalledWith({
      gameName: "幻兽帕鲁",
      focus: "联机稳定性"
    });
  });

  it("requires an explicit reason before excluding evidence", async () => {
    const user = userEvent.setup();
    const onExcludeEvidence = vi.fn();
    render(
      <ResearchWorkspace
        model={reportModel}
        onExcludeEvidence={onExcludeEvidence}
      />
    );

    await user.click(screen.getByRole("button", { name: "查看来源与证据" }));
    expect(screen.getByRole("dialog", { name: "来源与证据" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "排除证据 E1" }));
    expect((screen.getByRole("button", { name: "排除并重新生成" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText("排除原因"), "与目标游戏无关");
    await user.click(screen.getByRole("button", { name: "排除并重新生成" }));

    expect(onExcludeEvidence).toHaveBeenCalledWith(
      "evidence-1",
      "与目标游戏无关"
    );
  });

  it("closes the evidence drawer with Escape and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<ResearchWorkspace model={reportModel} />);
    const trigger = screen.getByRole("button", { name: "查看来源与证据" });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "来源与证据" })).not.toBeNull();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "来源与证据" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});