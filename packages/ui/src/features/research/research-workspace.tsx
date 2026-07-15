import { FileText, History, Radar, Settings } from "lucide-react";
import { AppShell } from "../../components/app-shell.js";
import { ResearchHistory } from "./research-history.js";
import { ResearchProgress } from "./research-progress.js";
import { ResearchSettings } from "./research-settings.js";
import { ResearchStart } from "./research-start.js";
import { SentimentReport } from "./sentiment-report.js";
import type { ResearchWorkspaceProps } from "./types.js";
import {
  useThemePreference,
  type ThemePreference
} from "../theme/use-theme.js";

const navigation = [
  { id: "research", label: "开始研究", icon: <Radar aria-hidden="true" className="size-5" /> },
  { id: "history", label: "历史报告", icon: <History aria-hidden="true" className="size-5" /> },
  { id: "settings", label: "设置", icon: <Settings aria-hidden="true" className="size-5" /> }
];

export function ResearchWorkspace(props: ResearchWorkspaceProps) {
  const theme = useThemePreference();
  const activeNavigationId =
    props.model.screen === "history"
      ? "history"
      : props.model.screen === "settings"
        ? "settings"
        : "research";

  return (
    <AppShell
      actions={
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-ring" aria-hidden="true" />
          本地研究库
        </div>
      }
      activeNavigationId={activeNavigationId}
      brand={
        <div className="grid size-10 place-items-center rounded-md bg-accent text-accent-foreground">
          <FileText aria-hidden="true" className="size-5" />
        </div>
      }
      navigation={navigation}
      onNavigate={(id) => props.onNavigate?.(id as "research" | "history" | "settings")}
      subtitle="游戏风评研究"
      title="GamePulse 游脉"
    >
      {renderScreen(props, theme.preference, theme.setPreference)}
    </AppShell>
  );
}

function renderScreen(
  props: ResearchWorkspaceProps,
  themePreference: ThemePreference,
  onThemePreferenceChange: (theme: ThemePreference) => void
) {
  const { model } = props;
  if (model.screen === "start") {
    return (
      <ResearchStart
        busy={model.busy}
        credentialsReady={model.credentialsReady}
        error={model.error}
        mode={model.mode}
        onOpenResearch={props.onOpenResearch}
        onStart={props.onStart}
        recent={model.recent}
      />
    );
  }
  if (model.screen === "progress") {
    return (
      <ResearchProgress
        canCancel={model.canCancel}
        canRegenerate={model.canRegenerate}
        error={model.error}
        focus={model.focus}
        gameName={model.gameName}
        identityCandidates={model.identityCandidates}
        onCancel={props.onCancel}
        onChooseIdentity={props.onChooseIdentity}
        onRegenerateReport={props.onRegenerateReport}
        sources={model.sources}
        stage={model.stage}
      />
    );
  }
  if (model.screen === "report") {
    return (
      <SentimentReport
        busy={model.busy}
        evidence={model.evidence}
        followUpAnswer={model.followUpAnswer}
        followUpBusy={model.followUpBusy}
        onAskFollowUp={props.onAskFollowUp}
        onExcludeEvidence={props.onExcludeEvidence}
        onUpdateResearch={props.onUpdateResearch}
        report={model.report}
      />
    );
  }
  if (model.screen === "history") {
    return (
      <ResearchHistory
        items={model.items}
        onOpenResearch={props.onOpenResearch}
        onStartResearch={() => props.onNavigate?.("research")}
      />
    );
  }
  return (
    <ResearchSettings
      onExportData={props.onExportData}
      onImportData={props.onImportData}
      onSaveSettings={props.onSaveSettings}
      settings={model.settings}
      themePreference={themePreference}
      onThemePreferenceChange={onThemePreferenceChange}
    />
  );
}
