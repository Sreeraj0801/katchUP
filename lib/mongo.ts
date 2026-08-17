import { MongoClient, Db, Collection } from "mongodb";

/**
 * MongoDB access layer.
 *
 * Schema note: Postgres stored categories in a separate `article_categories`
 * table and joined on every feed query. In Mongo they are embedded on the
 * article, which removes the join entirely — the feed becomes a single indexed
 * query. `likes` stays its own collection because it is written independently
 * of the article and is queried by `anon_id`.
 *
 * Article `id` remains a monotonic integer rather than an ObjectId: the public
 * URLs (`/article/5`) and the `likes.article_id` references already use it, so
 * switching to ObjectIds would break existing links and shared URLs. The
 * sequence lives in the `counters` collection.
 */

export type ArticleCategory = { category: string; score: number };

export type ArticleDoc = {
  _id?: unknown;
  id: number;
  title: string;
  link: string;
  canonical_link: string | null;
  source: string;
  published_at: Date | null;
  summary: string | null;
  tldr_bullets: string[];
  content: string | null;
  image_url: string | null;
  image_is_fallback: boolean;
  created_at: Date;
  categories: ArticleCategory[];
};

export type PreferenceDoc = {
  _id: string; // anonId
  categories: string[];
  settings: Record<string, unknown>;
  updated_at: Date;
};

export type LikeDoc = {
  _id?: unknown;
  anon_id: string;
  article_id: number;
  created_at: Date;
};

const DB_NAME = process.env.MONGODB_DB || "katchup";

function uri(): string {
  const value = process.env.MONGODB_URI;
  if (!value) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env.local locally and to the Vercel project's environment variables."
    );
  }
  return value;
}

/**
 * Serverless functions are frozen and thawed between invocations, so a module
 * scoped client would be re-created on every cold path and leak connections
 * against Atlas' connection limit. Caching the promise on `globalThis` means
 * one client per container, reused across invocations.
 */
type MongoCache = { client: MongoClient | null; promise: Promise<MongoClient> | null };
const globalForMongo = globalThis as unknown as { __mongo?: MongoCache };
const cache: MongoCache = (globalForMongo.__mongo ??= { client: null, promise: null });

export async function getClient(): Promise<MongoClient> {
  if (cache.client) return cache.client;
  if (!cache.promise) {
    cache.promise = new MongoClient(uri(), {
      maxPoolSize: 10,
      retryWrites: true,
    }).connect();
  }
  cache.client = await cache.promise;
  return cache.client;
}

export async function getDb(): Promise<Db> {
  return (await getClient()).db(DB_NAME);
}

export async function articles(): Promise<Collection<ArticleDoc>> {
  return (await getDb()).collection<ArticleDoc>("articles");
}

export async function preferences(): Promise<Collection<PreferenceDoc>> {
  return (await getDb()).collection<PreferenceDoc>("preferences");
}

export async function likes(): Promise<Collection<LikeDoc>> {
  return (await getDb()).collection<LikeDoc>("likes");
}

let initialized = false;

/**
 * Creates the indexes the app relies on. Mongo is schemaless so there is no
 * DDL to run, but the unique indexes are what enforce the invariants Postgres
 * previously guaranteed with constraints:
 *   - articles.link / canonical_link  -> dedupe on ingest
 *   - likes (anon_id, article_id)     -> one like per user per article
 */
export async function initDb(): Promise<void> {
  if (initialized) return;
  const [a, l] = await Promise.all([articles(), likes()]);
  await Promise.all([
    a.createIndex({ id: 1 }, { unique: true }),
    a.createIndex({ link: 1 }, { unique: true }),
    // Partial: only enforce uniqueness on real canonical links. A sparse index
    // would still index explicit nulls and reject the second one, and partial
    // filters don't accept `$ne`, so match on the type instead — that excludes
    // both null and missing.
    a.createIndex(
      { canonical_link: 1 },
      { unique: true, partialFilterExpression: { canonical_link: { $type: "string" } } }
    ),
    a.createIndex({ published_at: -1 }),
    // Drives the feed query: match on embedded category + score, sort by date.
    a.createIndex({ "categories.category": 1, "categories.score": -1 }),
    l.createIndex({ anon_id: 1, article_id: 1 }, { unique: true }),
    l.createIndex({ article_id: 1 }),
  ]);
  initialized = true;
}

/**
 * Atomic integer sequence, replacing Postgres' SERIAL.
 */
export async function nextArticleId(): Promise<number> {
  const db = await getDb();
  const res = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: "articleId" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );
  return res!.seq;
}
