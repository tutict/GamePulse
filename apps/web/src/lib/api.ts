import type { AnalysisRun, IngestItem, Platform, Project, Report } from "@gamepulse/shared";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:4317";
const API_TOKEN = import.meta.env.VITE_GAMEPULSE_API_TOKEN ?? import.meta.env.VITE_API_TOKEN;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  if (API_TOKEN) {
    headers.set("x-gamepulse-token", API_TOKEN);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error ?? response.statusText);
  }

  return (await response.json()) as T;
}

export async function getHealth(): Promise<{ ok: boolean }> {
  return request("/api/health");
}

export async function listProjects(): Promise<Project[]> {
  const payload = await request<{ projects: Project[] }>("/api/projects");
  return payload.projects;
}

export async function createProject(input: {
  name: string;
  description?: string;
  steamAppId?: string;
  redditSubreddits: string[];
  redditKeywords: string[];
  versionWindows: Project["versionWindows"];
  entityAliases: Project["entityAliases"];
}): Promise<Project> {
  const payload = await request<{ project: Project }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return payload.project;
}

export async function importRows(projectId: string, rows: IngestItem[], defaultPlatform: Platform = "import") {
  return request<{ accepted: number; inserted: number; parsed: number }>("/api/imports", {
    method: "POST",
    body: JSON.stringify({ projectId, rows, defaultPlatform })
  });
}

export async function uploadImport(projectId: string, file: File, defaultPlatform: Platform = "import") {
  const form = new FormData();
  form.append("projectId", projectId);
  form.append("defaultPlatform", defaultPlatform);
  form.append("file", file);

  return request<{ accepted: number; inserted: number; parsed: number }>("/api/imports", {
    method: "POST",
    body: form
  });
}

export async function runAnalysis(input: { projectId: string; versionWindowId?: string; periodStart?: string; periodEnd?: string }) {
  return request<{ runId: string; mode: "queued" | "inline" }>("/api/analysis/runs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function getRun(runId: string): Promise<AnalysisRun> {
  const payload = await request<{ run: AnalysisRun }>(`/api/analysis/runs/${runId}`);
  return payload.run;
}

export async function listReports(projectId?: string): Promise<Report[]> {
  const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const payload = await request<{ reports: Report[] }>(`/api/reports${params}`);
  return payload.reports;
}

export async function searchComments(input: {
  projectId: string;
  q?: string;
  platform?: string;
  sentiment?: string;
  cursor?: { at: string; id: string };
}) {
  const params = new URLSearchParams({ projectId: input.projectId, limit: "50" });
  if (input.q) params.set("q", input.q);
  if (input.platform) params.set("platform", input.platform);
  if (input.sentiment) params.set("sentiment", input.sentiment);
  if (input.cursor) {
    params.set("cursorAt", input.cursor.at);
    params.set("cursorId", input.cursor.id);
  }
  return request<{
    comments: Array<{
      id: string;
      platform: Platform;
      sourceUrl?: string;
      sourceTitle?: string;
      body: string;
      postedAt?: string;
      collectedAt: string;
      upvotes?: number;
      replies?: number;
      label?: {
        sentiment: string;
        topic: string;
        intent: string;
        severity: number;
        isBug: boolean;
        isChurnRisk: boolean;
        entities: Array<{ kind: string; canonical: string }>;
      };
    }>;
    nextCursor: { at: string; id: string } | null;
  }>(`/api/comments/search?${params.toString()}`);
}
