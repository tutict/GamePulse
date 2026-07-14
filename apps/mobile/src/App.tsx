import { ResearchWorkspace } from "@gamepulse/ui";
import { useMobileResearch } from "./research/useMobileResearch.js";

export function App() {
  const research = useMobileResearch();

  return (
    <ResearchWorkspace
      model={research.model}
      onAskFollowUp={(question) => void research.askFollowUp(question)}
      onCancel={() => research.cancel()}
      onChooseIdentity={(candidateId) => void research.chooseIdentity(candidateId)}
      onExcludeEvidence={(evidenceId, reason) => void research.excludeEvidence(evidenceId, reason)}
      onExportData={() => void research.exportData()}
      onImportData={() => void research.importData()}
      onNavigate={research.navigate}
      onOpenResearch={(researchId) => void research.openResearch(researchId)}
      onRegenerateReport={() => void research.regenerateReport()}
      onSaveSettings={(settings) => void research.saveSettings(settings)}
      onStart={(request) => void research.start(request)}
      onUpdateResearch={() => void research.updateResearch()}
    />
  );
}