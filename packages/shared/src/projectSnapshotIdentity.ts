import type { ProjectSnapshot } from './contracts.js';

export function assertProjectSnapshotIdentity(snapshot: ProjectSnapshot): void {
  for (const comment of snapshot.comments) {
    if (comment.projectId !== snapshot.project.id) {
      throw new Error(`Project snapshot comment projectId mismatch: ${comment.id}`);
    }
  }

  for (const report of snapshot.reports) {
    if (report.projectId !== snapshot.project.id) {
      throw new Error(`Project snapshot report projectId mismatch: ${report.id}`);
    }
  }

  const commentIds = new Set(snapshot.comments.map((comment) => comment.id));
  for (const label of snapshot.labels) {
    if (!commentIds.has(label.commentId)) {
      throw new Error(`Project snapshot label commentId is missing: ${label.commentId}`);
    }
  }
}
