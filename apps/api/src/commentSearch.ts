export interface CommentSearchInput {
  projectId: string;
  q?: string;
  platform?: string;
  sentiment?: string;
  cursorAt?: string;
  cursorId?: string;
  before?: string;
  limit: number;
  offset: number;
}

export interface CommentSearchQuery {
  text: string;
  values: unknown[];
  requestedLimit: number;
}

export function buildCommentSearchQuery(input: CommentSearchInput): CommentSearchQuery {
  const values: unknown[] = [input.projectId];
  const where = ["r.project_id = $1"];
  const bind = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };
  const queryText = input.q?.trim();
  if (queryText) {
    const placeholder = bind(queryText);
    where.push(isLatinSearch(queryText)
      ? `to_tsvector('simple', r.body_norm) @@ websearch_to_tsquery('simple', ${placeholder})`
      : `lower(r.body_norm) LIKE '%' || lower(${placeholder}) || '%'`);
  }
  if (input.platform) where.push(`r.platform = ${bind(input.platform)}`);
  if (input.sentiment) where.push(`l.sentiment = ${bind(input.sentiment)}`);
  const cursorAt = input.cursorAt ?? input.before;
  if (cursorAt && input.cursorId) {
    const at = bind(cursorAt);
    const id = bind(input.cursorId);
    where.push(`(r.effective_at < ${at}::timestamptz OR (r.effective_at = ${at}::timestamptz AND r.id < ${id}))`);
  } else if (cursorAt) {
    where.push(`r.effective_at < ${bind(cursorAt)}::timestamptz`);
  }
  const limit = bind(input.limit + 1);
  const offset = input.offset > 0 ? ` OFFSET ${bind(input.offset)}` : "";
  return {
    text: `SELECT r.id, r.platform, r.source_url, r.source_title, r.body, r.posted_at, r.collected_at,
                  r.effective_at, r.language, r.upvotes, r.replies, l.sentiment, l.topic, l.intent,
                  l.severity, l.is_bug, l.is_churn_risk, l.entities
           FROM raw_items r
           LEFT JOIN analysis_labels l ON l.comment_id = r.id
           WHERE ${where.join("\n             AND ")}
           ORDER BY r.effective_at DESC, r.id DESC
           LIMIT ${limit}${offset}`,
    values,
    requestedLimit: input.limit
  };
}

function isLatinSearch(value: string): boolean {
  return value.length >= 3 && !/[\u3400-\u9fff]/u.test(value);
}