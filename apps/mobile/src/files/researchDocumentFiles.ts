import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  buildResearchDocument,
  encodeResearchDocx,
  renderResearchDocumentHtml,
  researchDocumentFileName,
  type ResearchDocumentFormat,
  type ResearchRecord
} from "@gamepulse/shared";

interface DocumentPrinterPlugin {
  printHtml(options: { html: string; jobName: string }): Promise<void>;
}

const DocumentPrinter = registerPlugin<DocumentPrinterPlugin>("GamePulseDocument");

export async function exportAndShareResearchDocument(
  research: ResearchRecord,
  format: ResearchDocumentFormat
): Promise<{ fileName: string; action: "downloaded" | "shared" | "print" }> {
  const document = buildResearchDocument(research);
  const fileName = researchDocumentFileName(document, format);
  if (format === "pdf") {
    const html = renderResearchDocumentHtml(document);
    if (Capacitor.isNativePlatform()) {
      await DocumentPrinter.printHtml({ html, jobName: fileName });
      return { fileName, action: "print" };
    }
    openPrintWindow(html);
    return { fileName, action: "print" };
  }

  const bytes = encodeResearchDocx(document);
  if (!Capacitor.isNativePlatform()) {
    downloadBytes(
      bytes,
      fileName,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    return { fileName, action: "downloaded" };
  }
  const file = await Filesystem.writeFile({
    path: `exports/${fileName}`,
    data: bytesToBase64(bytes),
    directory: Directory.Cache,
    recursive: true
  });
  await Share.share({
    title: `${document.gameName} 风评研究报告`,
    text: "GamePulse Word 研究报告",
    files: [file.uri],
    dialogTitle: "分享研究报告"
  });
  return { fileName, action: "shared" };
}

function openPrintWindow(html: string): void {
  const preview = window.open("", "_blank");
  if (!preview) {
    throw new Error("浏览器阻止了 PDF 打印窗口");
  }
  preview.opener = null;
  preview.addEventListener("load", () => {
    preview.focus();
    preview.print();
  }, { once: true });
  preview.document.open();
  preview.document.write(html);
  preview.document.close();
}

function downloadBytes(bytes: Uint8Array, fileName: string, type: string): void {
  const url = URL.createObjectURL(
    new Blob([bytes.slice().buffer as ArrayBuffer], { type })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
