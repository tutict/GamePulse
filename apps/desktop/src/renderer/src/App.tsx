import { ResearchWorkspace, type ThemePreference } from "@gamepulse/ui";
import { useDesktopResearch } from "./useDesktopResearch.js";

function syncDesktopTheme(preference: ThemePreference): void {
  void window.gamepulse.theme.setPreference(preference).catch((error) => {
    console.error("Failed to synchronize the desktop theme.", error);
  });
}

export function App() {
  const research = useDesktopResearch();

  return (
    <ResearchWorkspace
      model={research.model}
      onAskFollowUp={(question) => void research.askFollowUp(question)}
      onCancel={() => void research.cancel()}
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
      onThemePreferenceChange={syncDesktopTheme}
      onUpdateResearch={() => void research.updateResearch()}
    />
  );
}
