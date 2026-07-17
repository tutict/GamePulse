import { useEffect, useReducer, useRef } from "react";
import {
  buildResearchFollowUp,
  compareResearchEvidence,
  type Project,
  type ResearchRecord
} from "@gamepulse/shared";
import type {
  EvidenceView,
  ModelDiscoveryInput,
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
  availableModels: string[];
  modelsLoading: boolean;
  modelsError?: string;
  modelsProvider?: "openai" | "ollama";
  modelsBaseUrl?: string;
  reportExportBusy: boolean;
  reportExportMessage?: string;
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
  followUpBusy: false,
  availableModels: [],
  modelsLoading: false,
  reportExportBusy: false
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
  const modelCatalogRequest = useRef(0);
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
      value: {
        activeView: "research",
        busy: true,
        error: undefined,
        reportExportMessage: undefined
      }
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
    cancelActiveModel();
    dispatch({
      type: "patch",
      value: view === "research"
        ? {
            activeView: view,
            current: undefined,
            error: undefined,
            followUpAnswer: undefined,
            followUpBusy: false,
            reportExportMessage: undefined
          }
        : { activeView: view, error: undefined }
    });
  }

  async function start(request: { gameName: string; focus?: string }) {
    cancelActiveModel();
    dispatch({
      type: "patch",
      value: {
        current: undefined,
        followUpAnswer: undefined,
        followUpBusy: false,
        reportExportMessage: undefined
      }
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
          followUpBusy: false,
          reportExportMessage: undefined
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
    dispatch({ type: "patch", value: { settingsMessage: "正在保存…", busy: true } });
    try {
      const modelStatus = await window.gamepulse.models.updateConfig(input);
      dispatch({
        type: "patch",
        value: {
          modelStatus,
          settingsMessage: modelStatus.provider === "ollama"
            ? "Ollama 配置已保存。"
            : `远程模型配置已保存${modelStatus.apiKeyHint ? `，密钥 ${modelStatus.apiKeyHint}` : ""}。`,
          busy: false
        }
      });
    } catch (error) {
      dispatch({ type: "patch", value: { settingsMessage: errorMessage(error), busy: false } });
    }
  }

  async function discoverModels(input: ModelDiscoveryInput) {
    const requestId = ++modelCatalogRequest.current;
    const modelsBaseUrl = input.baseUrl.trim().replace(/\/+$/, "");
    dispatch({
      type: "patch",
      value: {
        availableModels: [],
        modelsProvider: input.provider,
        modelsBaseUrl,
        modelsLoading: true,
        modelsError: undefined
      }
    });
    try {
      const result = await window.gamepulse.models.list(input);
      if (requestId !== modelCatalogRequest.current) {
        return;
      }
      dispatch({
        type: "patch",
        value: {
          availableModels: result.models,
          modelsLoading: false,
          modelsError: result.models.length === 0
            ? "模型服务没有返回可用模型。"
            : undefined
        }
      });
    } catch (error) {
      if (requestId !== modelCatalogRequest.current) {
        return;
      }
      dispatch({
        type: "patch",
        value: { modelsLoading: false, modelsError: errorMessage(error) }
      });
    }
  }

  async function importData() {
    dispatch({ type: "patch", value: { packageStatus: "正在导入…", busy: true } });
    try {
      const result = await window.gamepulse.projects.importPackage();
      if (result.canceled) {
        dispatch({ type: "patch", value: { packageStatus: undefined, busy: false } });
        return;
      }
      const projects = await window.gamepulse.projects.list();
      dispatch({
        type: "patch",
        value: {
          projects,
          packageStatus: `已导入 ${result.fileName}：新增 ${result.inserted} 条，更新 ${result.updated} 条。`,
          busy: false
        }
      });
    } catch (error) {
      dispatch({ type: "patch", value: { packageStatus: errorMessage(error), busy: false } });
    }
  }

  async function exportData() {
    const project = state.projects[0];
    if (!project) {
      dispatch({ type: "patch", value: { packageStatus: "没有可导出的旧项目包。", busy: false } });
      return;
    }
    dispatch({ type: "patch", value: { packageStatus: "正在导出…", busy: true } });
    try {
      const result = await window.gamepulse.projects.exportPackage(project.id);
      dispatch({
        type: "patch",
        value: result.canceled
          ? { packageStatus: undefined, busy: false }
          : { packageStatus: `已导出 ${result.fileName}，共 ${formatBytes(result.bytes)}。`, busy: false }
      });
    } catch (error) {
      dispatch({ type: "patch", value: { packageStatus: errorMessage(error), busy: false } });
    }
  }

  async function exportReport(format: "docx" | "pdf") {
    if (!state.current) return;
    dispatch({
      type: "patch",
      value: { reportExportBusy: true, reportExportMessage: "正在生成研究文档…" }
    });
    try {
      const result = await window.gamepulse.research.exportDocument(state.current.id, format);
      dispatch({
        type: "patch",
        value: {
          reportExportBusy: false,
          reportExportMessage: result.canceled
            ? undefined
            : `已导出 ${result.fileName}（${formatBytes(result.bytes)}）`
        }
      });
    } catch (error) {
      dispatch({
        type: "patch",
        value: { reportExportBusy: false, reportExportMessage: errorMessage(error) }
      });
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
    discoverModels,
    saveSettings,
    importData,
    exportData,
    exportReport
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
        mode: "live",
        provider: status?.provider ?? "openai",
        baseUrl: status?.baseUrl ?? "https://api.openai.com/v1",
        model: status?.model ?? "gpt-4.1-mini",
        availableModels: state.availableModels,
        modelsProvider: state.modelsProvider,
        modelsBaseUrl: state.modelsBaseUrl,
        modelsLoading: state.modelsLoading,
        modelsError: state.modelsError,
        hasApiKey: Boolean(status?.hasApiKey),
        apiKeyHint: status?.apiKeyHint,
        credentialsReady: status?.provider === "ollama" || Boolean(status?.hasApiKey),
        supportsOllama: true,
        busy: state.busy,
        message: state.settingsMessage,
        advancedData: {
          importEnabled: !state.busy,
          exportEnabled: !state.busy && state.projects.length > 0,
          status: state.packageStatus
        }
      }
    };
  }
  if (!state.current) {
    return {
      screen: "start",
      recent: state.history.map(toHistoryItem).slice(0, 5),
      mode: "live",
      credentialsReady: state.modelStatus?.provider === "ollama"
        || Boolean(state.modelStatus?.hasApiKey),
      busy: state.busy,
      error: state.error
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
      exportBusy: state.reportExportBusy,
      exportMessage: state.reportExportMessage,
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
    .sort(compareResearchEvidence)
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
      dateEstimated: item.dateEstimated,
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
