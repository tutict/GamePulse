import { toIso } from "./repository.js";

export function rowToReport(row: Record<string, unknown>) {
  return {
    id: row.id,
    runId: row.run_id,
    projectId: row.project_id,
    title: row.title,
    periodStart: row.period_start ? toIso(row.period_start) : undefined,
    periodEnd: row.period_end ? toIso(row.period_end) : undefined,
    markdown: row.markdown,
    summary: row.summary,
    createdAt: toIso(row.created_at)
  };
}
