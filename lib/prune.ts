import { getDb } from "./db";

/**
 * Retention policy.
 *
 * `content` (the full article text) is ~79% of a row's size and is only used
 * by the reader's "Full Read" tab, so it is dropped first. Headline, summary,
 * TLDR, image and categories are kept so the card still renders and old links
 * keep working.
 *
 * Articles a user liked are never deleted - likes drive the ranking model.
 */
export const STRIP_CONTENT_AFTER_DAYS = Number(process.env.RETENTION_STRIP_DAYS || 7);
export const DELETE_AFTER_DAYS = Number(process.env.RETENTION_DELETE_DAYS || 30);

export type PruneResult = {
  dryRun: boolean;
  strippedContent: number;
  deletedArticles: number;
  stripAfterDays: number;
  deleteAfterDays: number;
  bytesBefore: number;
  bytesAfter: number;
};

async function dbBytes(): Promise<number> {
  const res = await getDb().query("SELECT pg_database_size(current_database()) AS b");
  return Number(res.rows[0].b);
}

export async function runPrune({ dryRun = false }: { dryRun?: boolean } = {}): Promise<PruneResult> {
  const db = getDb();
  const bytesBefore = await dbBytes();

  const stripCutoff = `${STRIP_CONTENT_AFTER_DAYS} days`;
  const deleteCutoff = `${DELETE_AFTER_DAYS} days`;

  if (dryRun) {
    const [strip, del] = await Promise.all([
      db.query(
        `SELECT count(*)::int AS n FROM articles
         WHERE content IS NOT NULL
           AND COALESCE(published_at, created_at) < NOW() - $1::interval`,
        [stripCutoff]
      ),
      db.query(
        `SELECT count(*)::int AS n FROM articles a
         WHERE COALESCE(a.published_at, a.created_at) < NOW() - $1::interval
           AND NOT EXISTS (SELECT 1 FROM likes l WHERE l.article_id = a.id)`,
        [deleteCutoff]
      ),
    ]);
    return {
      dryRun: true,
      strippedContent: strip.rows[0].n,
      deletedArticles: del.rows[0].n,
      stripAfterDays: STRIP_CONTENT_AFTER_DAYS,
      deleteAfterDays: DELETE_AFTER_DAYS,
      bytesBefore,
      bytesAfter: bytesBefore,
    };
  }

  // Delete first so we don't waste work stripping rows that are about to go.
  const deleted = await db.query(
    `DELETE FROM articles a
     WHERE COALESCE(a.published_at, a.created_at) < NOW() - $1::interval
       AND NOT EXISTS (SELECT 1 FROM likes l WHERE l.article_id = a.id)`,
    [deleteCutoff]
  );

  const stripped = await db.query(
    `UPDATE articles
     SET content = NULL
     WHERE content IS NOT NULL
       AND COALESCE(published_at, created_at) < NOW() - $1::interval`,
    [stripCutoff]
  );

  return {
    dryRun: false,
    strippedContent: stripped.rowCount || 0,
    deletedArticles: deleted.rowCount || 0,
    stripAfterDays: STRIP_CONTENT_AFTER_DAYS,
    deleteAfterDays: DELETE_AFTER_DAYS,
    bytesBefore,
    bytesAfter: await dbBytes(),
  };
}
