import { ResearchWorkspace, type ThemePreference } from "@gamepulse/ui";
import { useMobileResearch } from "./research/useMobileResearch.js";
import { syncMobileTheme } from "./theme.js";

function syncNativeTheme(preference: ThemePreference): void {
  void syncMobileTheme(preference).catch((error) => {
    console.error("Failed to synchronize the mobile system bars.", error);
  });
}

export function App() {
  const research = useMobileResearch();

  return (
    <ResearchWorkspace
      model={research.model}
      onAskFollowUp={(question) => void research.askFollowUp(question)}
      onCancel={() => research.cancel()}
      onChooseIdentity={(candidateId) => void research.chooseIdentity(candidateId)}
      onExcludeEvidence={(evidenceId, reason) => void research.excludeEvidence(evidenceId, reason)}
      onDiscoverModels={(input) => void research.discoverModels(input)}
      onExportData={() => void research.exportData()}
      onExportReport={(format) => void research.exportReport(format)}
      onImportData={() => void research.importData()}
      onNavigate={research.navigate}
      onOpenResearch={(researchId) => void research.openResearch(researchId)}
      onRegenerateReport={() => void research.regenerateReport()}
      onSaveSettings={(settings) => void research.saveSettings(settings)}
      onStart={(request) => void research.start(request)}
      onThemePreferenceChange={syncNativeTheme}
      onUpdateResearch={() => void research.updateResearch()}
    />
  );
}
