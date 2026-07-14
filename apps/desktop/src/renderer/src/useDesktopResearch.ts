import { useEffect, useReducer, useRef } from "react";
import {
  buildResearchFollowUp,
  type Project,
  type ResearchRecord
} from "@gamepulse/shared";
import type {
  EvidenceView,
  ResearchHistoryItem,
  ResearchSettingsInput,
  ResearchWorkspaceModel,
  SentimentReportView
} from "@gamepulse/ui";
import type { ModelConfigStatus } from "./types.js";

type ActiveView = "research" | "history" | "settings";

interface DesktopResearchState {
  activeView: ActiveView;
  current?: ResearchRecord;
  history: ResearchRecord[];
  modelStatus?: ModelConfigStatus;
  projects: Project[];
  busy: boolean;
  error?: string;
  followUpAnswer?: string;
  followUpBusy: boolean;
  settingsMessage?: string;
  packageStatus?: string;
}

type DesktopResearchAction = {
  type: "patch";
  value: Partial<DesktopResearchState>;
};

const initialState: DesktopResearchState = {
  activeView: "research",
  history: [],
  projects: [],
  busy: false,
  followUpBusy: false
};

function reducer(
  state: DesktopResearchState,
  action: DesktopResearchAction
): DesktopResearchState {
  return action.type === "patch" ? { ...state, ...action.value } : state;
}

export function useDesktopResearch() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const activeModelRequest = useRef("");
  const followUpFallback = useRef("");
  const modelAnswerText = useRef("");

  useEffect(() => {
    let disposed = false;
    void Promise.all([
      window.gamepulse.research.list(),
      window.gamepulse.models.getStatus(),
      window.gamepulse.projects.list()
    ])
      .then(([history, modelStatus, projects]) => {
        if (!disposed) {
          dispatch({ type: "patch", value: { history, modelStatus, projects } });
        }
      })
      .catch((error) => {
        if (!disposed) {
          dispatch({ type: "patch", value: { error: errorMessage(error) } });
        }
      });

    const removeResearchListener = window.gamepulse.research.onEvent((current) => {
      dispatch({
        type: "patch",
        value: {
          current,
          busy: current.status === "running" || current.status === "pending",
          error: current.error
        }
      });
    });
    const removeModelListener = window.gamepulse.models.onEvent(({ requestId, event }) => {
      if (requestId !== activeModelRequest.current) {
        return;
      }
      if (event.type === "delta") {
        dispatch({
          type: "patch",
          value: {
            followUpAnswer: `${modelAnswerText.current}${event.text}`,
            followUpBusy: true
          }
        });
        modelAnswerText.current += event.text;
      } else if (event.type === "error") {
        activeModelRequest.current = "";
        modelAnswerText.current = followUpFallback.current;
        dispatch({
          type: "patch",
          value: {
            followUpAnswer: `${followUpFallback.current}\n\n模型回答失败：${event.message}`,
            followUpBusy: false
          }
        });
      } else {
        activeModelRequest.current = "";
        dispatch({ type: "patch", value: { followUpBusy: false } });
      }
    });
    return () => {
      disposed = true;
      if (activeModelRequest.current) {
        void window.gamepulse.models.cancel(activeModelRequest.current);
        activeModelRequest.current = "";
      }
      removeResearchListener();
      removeModelListener();
    };
  }, []);

  async function refreshHistory(): Promise<ResearchRecord[]> {
    const history = await window.gamepulse.research.list();
    dispatch({ type: "patch", value: { history } });
    return history;
  }

  async function runOperation(operation: () => Promise<ResearchRecord>) {
    dispatch({
      type: "patch",
      value: { activeView: "research", busy: true, error: undefined }
    });
    try {
      const current = await operation();
      dispatch({ type: "patch", value: { current, busy: false, error: current.error } });
      await refreshHistory();
      return current;
    } catch (error) {
      dispatch({ type: "patch", value: { busy: false, error: errorMessage(error) } });
      return undefined;
    }
  }

  function cancelActiveModel() {
    const requestId = activeModelRequest.current;
    activeModelRequest.current = "";
    modelAnswerText.current = "";
    if (requestId) {
      void window.gamepulse.models.cancel(requestId);
    }
  }

  function navigate(view: ActiveView) {
    if (view === "research") {
      cancelActiveModel();
    }
    dispatch({
      type: "patch",
      value: view === "research"
        ? {
            activeView: view,
            current: undefined,
            error: undefined,
            followUpAnswer: undefined,
            followUpBusy: false
          }
        : { activeView: view, error: undefined }
    });
  }

  async function start(request: { gameName: string; focus?: string }) {
    cancelActiveModel();
    dispatch({
      type: "patch",
      value: { current: undefined, followUpAnswer: undefined, followUpBusy: false }
    });
    await runOperation(() => window.gamepulse.research.start(request));
  }

  async function openResearch(researchId: string) {
    cancelActiveModel();
    dispatch({ type: "patch", value: { activeView: "research", busy: true } });
    try {
      const current = await window.gamepulse.research.get(researchId);
      if (!current) {
        throw new Error("Research was not found");
      }
      dispatch({
        type: "patch",
        value: {
          current,
          busy: false,
          error: undefined,
          followUpAnswer: undefined,
          followUpBusy: false
        }
      });
    } catch (error) {
      dispatch({ type: "patch", value: { busy: false, error: errorMessage(error) } });
    }
  }

  async function cancel() {
    if (state.current) {
      await window.gamepulse.research.cancel(state.current.id);
    }
  }

  async function chooseIdentity(candidateId: string) {
    if (state.current) {
      await runOperation(() =>
        window.gamepulse.research.continueIdentity(state.current!.id, candidateId)
      );
    }
  }

  async function updateResearch() {
    if (state.current) {
      await runOperation(() => window.gamepulse.research.refresh(state.current!.id));
    }
  }

  async function excludeEvidence(evidenceId: string, reason: string) {
    if (state.current) {
      await runOperation(() =>
        window.gamepulse.research.excludeEvidence(state.current!.id, evidenceId, reason)
      );
    }
  }

  async function regenerateReport() {
    if (state.current) {
      await runOperation(() => window.gamepulse.research.regenerate(state.current!.id));
    }
  }

  async function askFollowUp(question: string) {
    if (!state.current) {
      return;
    }
    const grounded = buildResearchFollowUp({ research: state.current, question });
    followUpFallback.current = grounded.fallbackAnswer;
    const canUseModel = state.modelStatus?.provider === "ollama"
      || Boolean(state.modelStatus?.hasApiKey);
    if (!canUseModel || grounded.citations.length === 0) {
      dispatch({
        type: "patch",
        value: { followUpAnswer: grounded.fallbackAnswer, followUpBusy: false }
      });
      return;
    }

    const requestId = crypto.randomUUID();
    activeModelRequest.current = requestId;
    modelAnswerText.current = "";
    dispatch({
      type: "patch",
      value: { followUpAnswer: "", followUpBusy: true }
    });
    try {
      await window.gamepulse.models.start({
        requestId,
        messages: [{ role: "user", content: grounded.prompt }],
        timeoutMs: 60_000,
        temperature: 0.1
      });
    } catch (error) {
      dispatch({
        type: "patch",
        value: {
          followUpAnswer: `${grounded.fallbackAnswer}\n\n模型回答失败：${errorMessage(error)}`,
          followUpBusy: false
        }
      });
    }
  }

  async function saveSettings(input: ResearchSettingsInput) {
    dispatch({ type: "patch", value: { settingsMessage: "正在保存…" } });
    try {
      const modelStatus = await window.gamepulse.models.updateConfig(input);
      dispatch({
        type: "patch",
        value: {
          modelStatus,
          settingsMessage: modelStatus.provider === "ollama"
            ? "Ollama 配置已保存。"
            : `远程模型配置已保存${modelStatus.apiKeyHint ? `，密钥 ${modelStatus.apiKeyHint}` : ""}。`
        }
      });
    } catch (error) {
      dispatch({ type: "patch", value: { settingsMessage: errorMessage(error) } });
    }
  }

  async function importData() {
    dispatch({ type: "patch", value: { packageStatus: "正在导入…" } });
    try {
      const result = await window.gamepulse.projects.importPackage();
      if (result.canceled) {
        dispatch({ type: "patch", value: { packageStatus: undefined } });
        return;
      }
      const projects = await window.gamepulse.projects.list();
      dispatch({
        type: "patch",
        value: {
          projects,
          packageStatus: `已导入 ${result.fileName}：新增 ${result.inserted} 条，更新 ${result.updated} 条。`
        }
      });
    } catch (error) {
      dispatch({ type: "patch", value: { packageStatus: errorMessage(error) } });
    }
  }

  async function exportData() {
    const project = state.projects[0];
    if (!project) {
      dispatch({ type: "patch", value: { packageStatus: "没有可导出的旧项目包。" } });
      return;
    }
    dispatch({ type: "patch", value: { packageStatus: "正在导出…" } });
    try {
      const result = await window.gamepulse.projects.exportPackage(project.id);
      dispatch({
        type: "patch",
        value: result.canceled
          ? { packageStatus: undefined }
          : { packageStatus: `已导出 ${result.fileName}，共 ${formatBytes(result.bytes)}。` }
      });
    } catch (error) {
      dispatch({ type: "patch", value: { packageStatus: errorMessage(error) } });
    }
  }

  return {
    model: buildWorkspaceModel(state),
    navigate,
    start,
    cancel,
    chooseIdentity,
    openResearch,
    updateResearch,
    excludeEvidence,
    regenerateReport,
    askFollowUp,
    saveSettings,
    importData,
    exportData
  };
}

function buildWorkspaceModel(state: DesktopResearchState): ResearchWorkspaceModel {
  if (state.activeView === "history") {
    return { screen: "history", items: state.history.map(toHistoryItem) };
  }
  if (state.activeView === "settings") {
    const status = state.modelStatus;
    return {
      screen: "settings",
      settings: {
        platform: "windows",
        mode: "fixture",
        provider: status?.provider ?? "openai",
        baseUrl: status?.baseUrl ?? "https://api.openai.com/v1",
        model: status?.model ?? "gpt-4.1-mini",
        apiKeyHint: status?.apiKeyHint,
        credentialsReady: status?.provider === "ollama" || Boolean(status?.hasApiKey),
        supportsOllama: true,
        busy: false,
        message: state.settingsMessage,
        advancedData: {
          importEnabled: true,
          exportEnabled: state.projects.length > 0,
          status: state.packageStatus
        }
      }
    };
  }
  if (!state.current) {
    return {
      screen: "start",
      recent: state.history.map(toHistoryItem).slice(0, 5),
      mode: "fixture",
      credentialsReady: state.modelStatus?.provider === "ollama"
        || Boolean(state.modelStatus?.hasApiKey),
      busy: state.busy
    };
  }

  const latestReport = state.current.reports.at(-1);
  if (state.current.status === "completed" && latestReport) {
    return {
      screen: "report",
      report: toReportView(state.current, latestReport),
      evidence: toEvidenceViews(state.current),
      followUpAnswer: state.followUpAnswer,
      followUpBusy: state.followUpBusy,
      busy: state.busy
    };
  }

  return {
    screen: "progress",
    gameName: state.current.request.gameName,
    focus: state.current.request.focus,
    stage: {
      id: state.current.stage ?? "identity",
      message: state.current.progressMessage ?? "准备研究",
      status: progressStatus(state.current.status),
      evidenceCount: activeEvidenceCount(state.current)
    },
    sources: state.current.sources,
    canCancel: state.current.status === "running" || state.current.status === "pending",
    identityCandidates: state.current.identityCandidates,
    error: state.current.error ?? state.error,
    canRegenerate: state.current.status === "failed" && state.current.evidence.length > 0
  };
}

function toHistoryItem(research: ResearchRecord): ResearchHistoryItem {
  const report = research.reports.at(-1);
  return {
    id: research.id,
    gameName: research.request.gameName,
    focus: research.request.focus,
    status: research.status,
    updatedAt: research.updatedAt,
    reportVersion: report?.version,
    verdict: report?.verdict,
    positiveRate: report?.positiveRate,
    historicalDelta: report?.historicalDelta
  };
}

function toReportView(
  research: ResearchRecord,
  report: ResearchRecord["reports"][number]
): SentimentReportView {
  return {
    researchId: research.id,
    gameName: research.request.gameName,
    focus: research.request.focus,
    version: report.version,
    updatedAt: report.createdAt,
    verdict: report.verdict,
    summary: report.summary,
    positiveRate: report.positiveRate,
    neutralRate: report.neutralRate,
    negativeRate: report.negativeRate,
    historicalDelta: report.historicalDelta,
    topics: report.topics,
    strengths: report.strengths,
    risks: report.risks,
    controversies: report.controversies,
    coverage: report.coverage
  };
}

function toEvidenceViews(research: ResearchRecord): EvidenceView[] {
  const excluded = new Set(research.exclusions.map((item) => item.evidenceId));
  return research.evidence
    .slice()
    .sort((left, right) => right.relevance - left.relevance || left.id.localeCompare(right.id))
    .map((item, index) => ({
      id: item.id,
      sourceId: item.sourceId,
      citationLabel: `E${index + 1}`,
      platform: item.platform,
      sourceTitle: item.sourceTitle,
      sourceUrl: item.sourceUrl,
      excerpt: item.excerpt,
      body: item.body,
      postedAt: item.postedAt,
      sentiment: item.sentiment,
      relevance: item.relevance,
      excluded: excluded.has(item.id),
      fixture: item.sourceUrl.includes("fixtures.gamepulse.local")
    }));
}

function activeEvidenceCount(research: ResearchRecord): number {
  const excluded = new Set(research.exclusions.map((item) => item.evidenceId));
  return research.evidence.filter((item) => !excluded.has(item.id)).length;
}

function progressStatus(status: ResearchRecord["status"]): "running" | "needs_input" | "failed" | "cancelled" {
  if (status === "needs_input" || status === "failed" || status === "cancelled") {
    return status;
  }
  return "running";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}