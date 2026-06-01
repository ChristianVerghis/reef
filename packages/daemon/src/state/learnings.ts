import type { Layer, Learning } from "@reef/shared";
import { db } from "./db.js";

interface LearningRow {
  id: string;
  content: string;
  topic: string;
  layer: string;
  source_run_id: string | null;
  repo_path: string;
  confidence: number;
  references_count: number;
  created_at: number;
  last_referenced_at: number | null;
  promoted_at: number | null;
}

function rowToLearning(row: LearningRow): Learning {
  return {
    id: row.id,
    content: row.content,
    topic: row.topic,
    layer: row.layer as Layer,
    sourceRunId: row.source_run_id ?? undefined,
    repoPath: row.repo_path,
    confidence: row.confidence,
    referencesCount: row.references_count,
    createdAt: row.created_at,
    lastReferencedAt: row.last_referenced_at ?? undefined,
    promotedAt: row.promoted_at ?? undefined,
  };
}

export function insertLearning(learning: Learning): void {
  db()
    .prepare(
      `INSERT INTO learnings (id, content, topic, layer, source_run_id, repo_path, confidence, references_count, created_at, last_referenced_at, promoted_at)
       VALUES (@id, @content, @topic, @layer, @source_run_id, @repo_path, @confidence, @references_count, @created_at, @last_referenced_at, @promoted_at)`,
    )
    .run({
      id: learning.id,
      content: learning.content,
      topic: learning.topic,
      layer: learning.layer,
      source_run_id: learning.sourceRunId ?? null,
      repo_path: learning.repoPath,
      confidence: learning.confidence,
      references_count: learning.referencesCount,
      created_at: learning.createdAt,
      last_referenced_at: learning.lastReferencedAt ?? null,
      promoted_at: learning.promotedAt ?? null,
    });
}

export function findLearning(id: string): Learning | null {
  const row = db()
    .prepare<[string], LearningRow>(`SELECT * FROM learnings WHERE id = ?`)
    .get(id);
  return row ? rowToLearning(row) : null;
}

export function listAllLearnings(): Learning[] {
  const rows = db()
    .prepare<[], LearningRow>(
      `SELECT * FROM learnings
       ORDER BY
         CASE layer
           WHEN 'topsoil' THEN 0
           WHEN 'loam' THEN 1
           WHEN 'bedrock' THEN 2
           WHEN 'fossil' THEN 3
         END ASC,
         created_at DESC`,
    )
    .all();
  return rows.map(rowToLearning);
}

/**
 * Topic-based retrieval — the v1 "dig" operation. Matches against the topic
 * column first; falls back to content LIKE search if no topic matches. Future:
 * embedding-based semantic retrieval.
 */
export function digByTopic(query: string, repoPath?: string): Learning[] {
  const like = `%${query}%`;
  const rows = repoPath
    ? db()
        .prepare<[string, string, string, string], LearningRow>(
          `SELECT * FROM learnings
           WHERE repo_path = ? AND (topic LIKE ? OR content LIKE ?)
             AND layer != 'fossil' OR ? = 'all'
           ORDER BY
             CASE layer
               WHEN 'bedrock' THEN 0
               WHEN 'loam' THEN 1
               WHEN 'topsoil' THEN 2
               WHEN 'fossil' THEN 3
             END ASC,
             confidence DESC,
             created_at DESC`,
        )
        .all(repoPath, like, like, "")
    : db()
        .prepare<[string, string], LearningRow>(
          `SELECT * FROM learnings
           WHERE (topic LIKE ? OR content LIKE ?) AND layer != 'fossil'
           ORDER BY
             CASE layer
               WHEN 'bedrock' THEN 0
               WHEN 'loam' THEN 1
               WHEN 'topsoil' THEN 2
               WHEN 'fossil' THEN 3
             END ASC,
             confidence DESC,
             created_at DESC`,
        )
        .all(like, like);

  // Side effect: bump references_count + last_referenced_at on retrieved rows.
  // This is what drives the topsoil → loam promotion path.
  const now = Date.now();
  for (const row of rows) {
    db()
      .prepare(
        `UPDATE learnings SET references_count = references_count + 1, last_referenced_at = ? WHERE id = ?`,
      )
      .run(now, row.id);
  }

  return rows.map(rowToLearning);
}

export function promoteLayer(id: string, layer: Layer): boolean {
  const result = db()
    .prepare(`UPDATE learnings SET layer = ?, promoted_at = ? WHERE id = ?`)
    .run(layer, Date.now(), id);
  return result.changes > 0;
}

/**
 * Background promotion: topsoil → loam when a learning has been referenced
 * enough times AND aged enough days. Mirrors how sediment settles into
 * sedimentary rock with time + pressure.
 *
 * Called on daemon startup; could be wired to a cron later.
 */
export function promoteEligibleLearnings(opts: {
  minReferences?: number;
  minAgeDays?: number;
} = {}): number {
  const minReferences = opts.minReferences ?? 3;
  const minAgeDays = opts.minAgeDays ?? 7;
  const cutoffMs = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;
  const result = db()
    .prepare(
      `UPDATE learnings
       SET layer = 'loam', promoted_at = ?
       WHERE layer = 'topsoil'
         AND references_count >= ?
         AND created_at <= ?`,
    )
    .run(Date.now(), minReferences, cutoffMs);
  return result.changes;
}

export function topicsForRepo(repoPath: string): { topic: string; count: number }[] {
  const rows = db()
    .prepare<[string], { topic: string; count: number }>(
      `SELECT topic, COUNT(*) AS count
       FROM learnings
       WHERE repo_path = ? AND layer != 'fossil'
       GROUP BY topic
       ORDER BY count DESC, topic ASC`,
    )
    .all(repoPath);
  return rows;
}
