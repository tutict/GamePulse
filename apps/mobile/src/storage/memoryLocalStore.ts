import {
  buildRagContentHash,
  buildSearchTerms,
  hashAuthor,
  normalizeCommentText,
  sanitizeMetadata,
  type CommentRecord,
  type IngestItem,
  type LocalStore,
  type LocalStoreSearchInput,
  type LocalStoreStats,
  type LocalStoreWriteResult,
  type Project,
  type ProjectMergeResult,
  type ProjectSnapshot,
  type RagEvidenceCandidate
} from "@gamepulse/shared";

export class MemoryLocalStore implements LocalStore {
  private readonly projects = new Map<string, Project>();
  private readonly comments = new Map<string, CommentRecord>();

  async initialize(): Promise<void> {}
  async close(): Promise<void> {}

  async getStats(projectId?: string): Promise<LocalStoreStats> {
    const comments = this.projectComments(projectId);
    return {
      projectCount: projectId ? Number(this.projects.has(projectId)) : this.projects.size,
      commentCount: comments.length,
      latestCollectedAt: comments.toSorted((a, b) =>
        b.collectedAt.localeCompare(a.collectedAt)
      )[0]?.collectedAt
    };
  }

  async listProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).toSorted((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    return this.projects.get(projectId);
  }

  async saveProject(project: Project): Promise<void> {
    this.projects.set(project.id, structuredClone(project));
  }

  async ingestComments(projectId: string, items: IngestItem[]): Promise<LocalStoreWriteResult> {
    const existing = new Set(this.projectComments(projectId).map((comment) => comment.contentHash));
    let accepted = 0;
    let inserted = 0;
    for (const item of items) {
      const body = normalizeCommentText(item.body);
      if (!body) {
        continue;
      }
      accepted += 1;
      const contentHash = buildRagContentHash({ ...item, body });
      if (existing.has(contentHash)) {
        continue;
      }
      existing.add(contentHash);
      const comment: CommentRecord = {
        ...item,
        id: globalThis.crypto.randomUUID(),
        projectId,
        body,
        bodyNorm: body,
        contentHash,
        authorHash: hashAuthor(item),
        collectedAt: new Date().toISOString(),
        metadata: sanitizeMetadata(item.metadata)
      };
      this.comments.set(comment.id, comment);
      inserted += 1;
    }
    return { accepted, inserted };
  }

  async searchEvidence(input: LocalStoreSearchInput): Promise<RagEvidenceCandidate[]> {
    const terms = buildSearchTerms(input.query);
    return this.projectComments(input.projectId)
      .map((comment) => {
        const searchable = `${comment.bodyNorm} ${comment.sourceTitle ?? ""}`.toLowerCase();
        const retrievalScore = terms.reduce(
          (score, term) => score + (searchable.includes(term) ? 1 : 0),
          0
        );
        return { ...comment, retrievalScore };
      })
      .filter((comment) => (comment.retrievalScore ?? 0) > 0)
      .toSorted((a, b) =>
        (b.retrievalScore ?? 0) - (a.retrievalScore ?? 0)
        || b.collectedAt.localeCompare(a.collectedAt)
      )
      .slice(0, input.limit ?? 32);
  }

  async exportProject(projectId: string): Promise<ProjectSnapshot> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      project: structuredClone(project),
      comments: structuredClone(this.projectComments(projectId)),
      labels: [],
      reports: []
    };
  }

  async importProject(snapshot: ProjectSnapshot): Promise<ProjectMergeResult> {
    await this.saveProject(snapshot.project);
    const existing = new Set(this.projectComments(snapshot.project.id).map((item) => item.contentHash));
    let inserted = 0;
    for (const comment of snapshot.comments) {
      if (existing.has(comment.contentHash)) {
        continue;
      }
      existing.add(comment.contentHash);
      this.comments.set(comment.id, structuredClone(comment));
      inserted += 1;
    }
    return {
      projectId: snapshot.project.id,
      accepted: snapshot.comments.length,
      inserted,
      updated: 0
    };
  }

  private projectComments(projectId?: string): CommentRecord[] {
    return Array.from(this.comments.values()).filter(
      (comment) => !projectId || comment.projectId === projectId
    );
  }
}
