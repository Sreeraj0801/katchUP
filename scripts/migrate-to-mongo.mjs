#!/usr/bin/env node
/**
 * One-shot migration: local Postgres -> MongoDB Atlas.
 *
 * Reads every row from the Postgres schema and writes the Mongo equivalent:
 *
 *   articles + article_categories  ->  articles (categories embedded)
 *   preferences                    ->  preferences (_id = anon_id)
 *   likes                          ->  likes
 *   MAX(articles.id)               ->  counters/articleId (so new ingests continue the sequence)
 *
 * Idempotent: every write is an upsert keyed on the natural key, so re-running
 * will not duplicate anything.
 *
 * Usage:
 *   node scripts/migrate-to-mongo.mjs [--verify-only]
 *
 * Requires DATABASE_URL (source) and MONGODB_URI (target) in the environment.
 */
import { Pool } from "pg";
import { MongoClient } from "mongodb";
import { readFileSync } from "fs";

// Next.js loads .env.local automatically; a bare node script does not.
function loadEnvLocal() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!m) continue;
        const [, k, v] = m;
        if (!process.env[k]) process.env[k] = v.replace(/^['"]|['"]$/g, "");
      }
    } catch {
      /* file is optional */
    }
  }
}
loadEnvLocal();

const VERIFY_ONLY = process.argv.includes("--verify-only");

const DATABASE_URL = process.env.DATABASE_URL;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "katchup";

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set (expected in .env.local).");
  process.exit(1);
}

const mongo = new MongoClient(MONGODB_URI);
await mongo.connect();
const mdb = mongo.db(MONGODB_DB);

async function mongoCounts() {
  const [articles, preferences, likes] = await Promise.all([
    mdb.collection("articles").countDocuments(),
    mdb.collection("preferences").countDocuments(),
    mdb.collection("likes").countDocuments(),
  ]);
  // Embedded categories, counted for parity with the Postgres table.
  const cat = await mdb
    .collection("articles")
    .aggregate([{ $project: { n: { $size: { $ifNull: ["$categories", []] } } } }, { $group: { _id: null, total: { $sum: "$n" } } }])
    .toArray();
  return { articles, preferences, likes, categories: cat[0]?.total || 0 };
}

if (VERIFY_ONLY) {
  console.log("MongoDB:", await mongoCounts());
  await mongo.close();
  process.exit(0);
}

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set (needed to read the source Postgres DB).");
  process.exit(1);
}

const pg = new Pool({ connectionString: DATABASE_URL });

console.log(`Source: ${DATABASE_URL.replace(/:[^:@/]*@/, ":***@")}`);
console.log(`Target: ${MONGODB_URI.replace(/:[^:@/]*@/, ":***@")} db=${MONGODB_DB}\n`);

// ---- articles (+ embedded categories) ----------------------------------------
const { rows: pgArticles } = await pg.query(`
  SELECT a.*,
         COALESCE(
           (SELECT json_agg(json_build_object('category', ac.category, 'score', ac.score) ORDER BY ac.score DESC)
            FROM article_categories ac WHERE ac.article_id = a.id),
           '[]'::json
         ) AS categories
  FROM articles a
  ORDER BY a.id
`);

let articlesWritten = 0;
if (pgArticles.length > 0) {
  const ops = pgArticles.map((a) => ({
    updateOne: {
      filter: { id: a.id },
      update: {
        $set: {
          id: a.id,
          title: a.title,
          link: a.link,
          canonical_link: a.canonical_link ?? null,
          source: a.source,
          published_at: a.published_at ? new Date(a.published_at) : null,
          summary: a.summary ?? null,
          tldr_bullets: a.tldr_bullets ?? [],
          content: a.content ?? null,
          image_url: a.image_url ?? null,
          image_is_fallback: a.image_is_fallback ?? true,
          created_at: a.created_at ? new Date(a.created_at) : new Date(),
          categories: (a.categories || []).map((c) => ({
            category: c.category,
            score: c.score,
          })),
        },
      },
      upsert: true,
    },
  }));
  const res = await mdb.collection("articles").bulkWrite(ops, { ordered: false });
  articlesWritten = res.upsertedCount + res.modifiedCount + res.matchedCount;
}
console.log(`articles           ${pgArticles.length} read -> ${articlesWritten} written`);

// ---- preferences -------------------------------------------------------------
const { rows: pgPrefs } = await pg.query("SELECT * FROM preferences");
if (pgPrefs.length > 0) {
  await mdb.collection("preferences").bulkWrite(
    pgPrefs.map((p) => ({
      updateOne: {
        filter: { _id: p.anon_id },
        update: {
          $set: {
            categories: p.categories ?? [],
            settings: p.settings ?? {},
            updated_at: p.updated_at ? new Date(p.updated_at) : new Date(),
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}
console.log(`preferences        ${pgPrefs.length} read`);

// ---- likes ------------------------------------------------------------------
const { rows: pgLikes } = await pg.query("SELECT * FROM likes");
if (pgLikes.length > 0) {
  await mdb.collection("likes").bulkWrite(
    pgLikes.map((l) => ({
      updateOne: {
        filter: { anon_id: l.anon_id, article_id: l.article_id },
        update: {
          $set: {
            anon_id: l.anon_id,
            article_id: l.article_id,
            created_at: l.created_at ? new Date(l.created_at) : new Date(),
          },
        },
        upsert: true,
      },
    })),
    { ordered: false }
  );
}
console.log(`likes              ${pgLikes.length} read`);

// ---- id sequence ------------------------------------------------------------
// Without this the first new ingest would start at id 1 and collide with
// migrated articles on the unique index.
const { rows: maxRow } = await pg.query("SELECT COALESCE(MAX(id), 0) AS max FROM articles");
const maxId = Number(maxRow[0].max);
await mdb
  .collection("counters")
  .updateOne({ _id: "articleId" }, { $set: { seq: maxId } }, { upsert: true });
console.log(`counters/articleId set to ${maxId}`);

// ---- verify -----------------------------------------------------------------
const { rows: pgCounts } = await pg.query(`
  SELECT (SELECT count(*) FROM articles)::int           AS articles,
         (SELECT count(*) FROM article_categories)::int  AS categories,
         (SELECT count(*) FROM preferences)::int         AS preferences,
         (SELECT count(*) FROM likes)::int               AS likes
`);
const before = pgCounts[0];
const after = await mongoCounts();

console.log("\nPostgres:", before);
console.log("MongoDB: ", after);

const mismatches = Object.keys(before).filter((k) => before[k] !== after[k]);
await pg.end();
await mongo.close();

if (mismatches.length > 0) {
  console.error(`\nFAIL - counts differ for: ${mismatches.join(", ")}`);
  process.exit(1);
}
console.log("\nOK - all counts match.");
