import { initDb, getDb, articles, likes } from "./mongo";

/**
 * Retention policy.
 *
 * `content` (the full article text) is ~79% of a document's size and is only
 * used by the reader's "Full Read" tab, so it is dropped first. Headline,
 * summary, TLDR, image and categories are kept so the card still renders and
 * old links keep working.
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

/** Mongo's equivalent of pg_database_size(). */
async function dbBytes(): Promise<number> {
  const stats = (await (await getDb()).command({ dbStats: 1 })) as { dataSize?: number };
  return Number(stats.dataSize || 0);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function runPrune({ dryRun = false }: { dryRun?: boolean } = {}): Promise<PruneResult> {
  await initDb();
  const [articlesCol, likesCol] = await Promise.all([articles(), likes()]);
  const bytesBefore = await dbBytes();

  const stripCutoff = daysAgo(STRIP_CONTENT_AFTER_DAYS);
  const deleteCutoff = daysAgo(DELETE_AFTER_DAYS);

  // Postgres used COALESCE(published_at, created_at); $ifNull is the Mongo
  // equivalent, expressed via $expr so it can be used inside a filter.
  const olderThan = (cutoff: Date) => ({
    $expr: { $lt: [{ $ifNull: ["$published_at", "$created_at"] }, cutoff] },
  });

  const strippableFilter = {
    content: { $ne: null },
    ...olderThan(stripCutoff),
  };

  // There are no joins here, so the "NOT EXISTS (SELECT 1 FROM likes ...)"
  // clause becomes an explicit id exclusion. The liked set is tiny (one row per
  // user per article) so pulling it into memory is cheap.
  const likedIds = await likesCol.distinct("article_id");
  const deletableFilter = {
    ...olderThan(deleteCutoff),
    id: { $nin: likedIds },
  };

  if (dryRun) {
    const [strip, del] = await Promise.all([
      articlesCol.countDocuments(strippableFilter as any),
      articlesCol.countDocuments(deletableFilter as any),
    ]);
    return {
      dryRun: true,
      strippedContent: strip,
      deletedArticles: del,
      stripAfterDays: STRIP_CONTENT_AFTER_DAYS,
      deleteAfterDays: DELETE_AFTER_DAYS,
      bytesBefore,
      bytesAfter: bytesBefore,
    };
  }

  // Delete first so we don't waste work stripping docs that are about to go.
  const deleted = await articlesCol.deleteMany(deletableFilter as any);
  const stripped = await articlesCol.updateMany(strippableFilter as any, {
    $set: { content: null },
  });

  return {
    dryRun: false,
    strippedContent: stripped.modifiedCount || 0,
    deletedArticles: deleted.deletedCount || 0,
    stripAfterDays: STRIP_CONTENT_AFTER_DAYS,
    deleteAfterDays: DELETE_AFTER_DAYS,
    bytesBefore,
    bytesAfter: await dbBytes(),
  };
}
