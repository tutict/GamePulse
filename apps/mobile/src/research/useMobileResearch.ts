import { useEffect, useReducer, useRef } from "react";
import {
  buildResearchFollowUp,
  type LocalStore,
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
import {
  exportAndShareProject,
  pickAndImportFile
} from "../files/projectFiles.js";
import { RemoteModelGateway } from "../models/remoteModelGateway.js";
import {
  getRemoteModelStatus,
  resolveRemoteModelConfig,
  saveRemoteModelConfig,
  type RemoteModelConfigStatus
} from "../models/secureModelConfig.js";
import { getLocalStore } from "../storage/index.js";
import {
  createMobileResearchController,
  type MobileResearchController
} from "./mobileResearchController.js";

type ActiveView = "research" | "history" | "settings";

interface MobileResearchState {
  activeView: ActiveView;
  current?: ResearchRecord;
  history: ResearchRecord[];
  modelStatus?: RemoteModelConfigStatus;
  projects: Project[];
  busy: boolean;
  error?: string;
  followUpAnswer?: string;
  followUpBusy: boolean;
  settingsMessage?: string;
  packageStatus?: string;
}

type MobileResearchAction = {
  type: "patch";
  value: Partial<MobileResearchState>;
};

const initialState: MobileResearchState = {
  activeView: "research",
  history: [],
  projects: [],
  busy: true,
  followUpBusy: false
};

function reducer(state: MobileResearchState, action: MobileResearchAction): MobileResearchState {
  return action.type === "patch" ? { ...state, ...action.value } : state;
}

export function useMobileResearch() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const storeRef = useRef<LocalStore | undefined>(undefined);
  const controllerRef = useRef<MobileResearchController | undefined>(undefined);
  const modelAbort = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const store = await getLocalStore();
        const controller = createMobileResearchController(store);
        const [history, modelStatus, projects] = await Promise.all([
          controller.list(),
          getRemoteModelStatus(),
          store.listProjects()
        ]);
        if (disposed) {
          return;
        }
        storeRef.current = store;
        controllerRef.current = controller;
        dispatch({
          type: "patch",
          value: { history, modelStatus, projects, busy: false, error: undefined }
        });
      } catch (error) {
        if (!disposed) {
          dispatch({
            type: "patch",
            value: { busy: false, error: errorMessage(error) }
          });
        }
      }
    })();
    return () => {
      disposed = true;
      controllerRef.current?.cancelAll();
      modelAbort.current?.abort();
    };
  }, []);

  function requireController(): MobileResearchController {
    if (!controllerRef.current) {
      throw new Error("本地研究库尚未初始化");
    }
    return controllerRef.current;
  }

  function handleProgress(current: ResearchRecord) {
    dispatch({
      type: "patch",
      value: {
        current,
        busy: current.status === "running" || current.status === "pending",
        error: current.error
      }
    });
  }

  async function refreshHistory() {
    const history = await requireController().list();
    dispatch({ type: "patch", value: { history } });
  }

  async function runOperation(
    operation: (
      controller: MobileResearchController,
      onProgress: (current: ResearchRecord) => void
    ) => Promise<ResearchRecord>
  ) {
    dispatch({
      type: "patch",
      value: { activeView: "research", busy: true, error: undefined }
    });
    try {
      const current = await operation(requireController(), handleProgress);
      dispatch({ type: "patch", value: { current, busy: false, error: current.error } });
      await refreshHistory();
      return current;
    } catch (error) {
      dispatch({ type: "patch", value: { busy: false, error: errorMessage(error) } });
      return undefined;
    }
  }

  function cancelActiveModel() {
    modelAbort.current?.abort();
    modelAbort.current = undefined;
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
    await runOperation((controller, onProgress) => controller.start(request, onProgress));
  }

  async function openResearch(researchId: string) {
    cancelActiveModel();
    dispatch({ type: "patch", value: { activeView: "research", busy: true } });
    try {
      const current = await requireController().get(researchId);
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

  function cancel() {
    if (state.current) {
      requireController().cancel(state.current.id);
    }
  }

  async function chooseIdentity(candidateId: string) {
    if (state.current) {
      await runOperation((controller, onProgress) =>
        controller.continueWithIdentity(state.current!.id, candidateId, onProgress)
      );
    }
  }

  async function updateResearch() {
    if (state.current) {
      await runOperation((controller, onProgress) =>
        controller.refresh(state.current!.id, onProgress)
      );
    }
  }

  async function excludeEvidence(evidenceId: string, reason: string) {
    if (state.current) {
      await runOperation((controller) =>
        controller.excludeEvidence(state.current!.id, evidenceId, reason)
      );
    }
  }

  async function regenerateReport() {
    if (state.current) {
      await runOperation((controller) => controller.regenerate(state.current!.id));
    }
  }

  async function askFollowUp(question: string) {
    if (!state.current) {
      return;
    }
    const grounded = buildResearchFollowUp({ research: state.current, question });
    if (!state.modelStatus?.hasApiKey || grounded.citations.length === 0) {
      dispatch({
        type: "patch",
        value: { followUpAnswer: grounded.fallbackAnswer, followUpBusy: false }
      });
      return;
    }

    cancelActiveModel();
    const abort = new AbortController();
    modelAbort.current = abort;
    dispatch({ type: "patch", value: { followUpAnswer: "", followUpBusy: true } });
    let answer = "";
    try {
      const config = await resolveRemoteModelConfig();
      const gateway = new RemoteModelGateway(config);
      for await (const event of gateway.stream({
        model: config.model,
        messages: [{ role: "user", content: grounded.prompt }],
        timeoutMs: 60_000,
        temperature: 0.1,
        signal: abort.signal
      })) {
        if (event.type === "delta") {
          answer += event.text;
          dispatch({ type: "patch", value: { followUpAnswer: answer } });
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      }
      dispatch({ type: "patch", value: { followUpBusy: false } });
    } catch (error) {
      if (!abort.signal.aborted) {
        dispatch({
          type: "patch",
          value: {
            followUpAnswer: `${grounded.fallbackAnswer}\n\n模型回答失败：${errorMessage(error)}`,
            followUpBusy: false
          }
        });
      }
    } finally {
      if (modelAbort.current === abort) {
        modelAbort.current = undefined;
      }
    }
  }

  async function saveSettings(input: ResearchSettingsInput) {
    dispatch({ type: "patch", value: { settingsMessage: "正在保存…", busy: true } });
    try {
      const modelStatus = await saveRemoteModelConfig({
        baseUrl: input.baseUrl,
        model: input.model,
        apiKey: input.apiKey
      });
      dispatch({
        type: "patch",
        value: { modelStatus, settingsMessage: "远程模型配置已安全保存。", busy: false }
      });
    } catch (error) {
      dispatch({ type: "patch", value: { settingsMessage: errorMessage(error), busy: false } });
    }
  }

  async function importData() {
    const store = storeRef.current;
    if (!store) {
      dispatch({ type: "patch", value: { packageStatus: "本地研究库尚未初始化。", busy: false } });
      return;
    }
    dispatch({ type: "patch", value: { packageStatus: "正在导入…", busy: true } });
    try {
      const result = await pickAndImportFile(store);
      if (!result) {
        dispatch({ type: "patch", value: { packageStatus: undefined, busy: false } });
        return;
      }
      const projects = await store.listProjects();
      dispatch({
        type: "patch",
        value: {
          projects,
          packageStatus: `已导入 ${result.fileName}：新增 ${result.inserted}/${result.accepted} 条。`,
          busy: false
        }
      });
    } catch (error) {
      dispatch({ type: "patch", value: { packageStatus: errorMessage(error), busy: false } });
    }
  }

  async function exportData() {
    const store = storeRef.current;
    const project = state.projects[0];
    if (!store || !project) {
      dispatch({ type: "patch", value: { packageStatus: "没有可导出的旧项目包。", busy: false } });
      return;
    }
    dispatch({ type: "patch", value: { packageStatus: "正在导出…", busy: true } });
    try {
      const fileName = await exportAndShareProject(store, project.id);
      dispatch({ type: "patch", value: { packageStatus: `已生成 ${fileName}`, busy: false } });
    } catch (error) {
      dispatch({ type: "patch", value: { packageStatus: errorMessage(error), busy: false } });
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

function buildWorkspaceModel(state: MobileResearchState): ResearchWorkspaceModel {
  if (state.activeView === "history") {
    return { screen: "history", items: state.history.map(toHistoryItem) };
  }
  if (state.activeView === "settings") {
    const status = state.modelStatus;
    return {
      screen: "settings",
      settings: {
        platform: "android",
        mode: "fixture",
        provider: "openai",
        baseUrl: status?.baseUrl ?? "https://api.openai.com/v1",
        model: status?.model ?? "gpt-4.1-mini",
        apiKeyHint: status?.apiKeyHint,
        credentialsReady: Boolean(status?.hasApiKey),
        supportsOllama: false,
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
      mode: "fixture",
      credentialsReady: Boolean(state.modelStatus?.hasApiKey),
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}