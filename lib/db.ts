import { Pool } from "pg";

let pool: Pool | null = null;
let initialized = false;

export function getDb(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? true : undefined,
    });
  }
  return pool;
}

export async function initDb() {
  if (initialized) return;
  const client = await getDb().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS articles (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        link TEXT UNIQUE NOT NULL,
        canonical_link TEXT,
        source TEXT NOT NULL,
        published_at TIMESTAMPTZ,
        summary TEXT,
        tldr_bullets TEXT[] DEFAULT ARRAY[]::TEXT[],
        content TEXT,
        image_url TEXT,
        image_is_fallback BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS article_categories (
        id SERIAL PRIMARY KEY,
        article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        score REAL NOT NULL,
        UNIQUE(article_id, category)
      );

      CREATE TABLE IF NOT EXISTS preferences (
        anon_id TEXT PRIMARY KEY,
        categories TEXT[] NOT NULL,
        settings JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        anon_id TEXT NOT NULL,
        article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(anon_id, article_id)
      );

      -- migrations for older schema (must happen before indexes on new columns)
      ALTER TABLE articles ADD COLUMN IF NOT EXISTS canonical_link TEXT;
      ALTER TABLE articles ADD COLUMN IF NOT EXISTS tldr_bullets TEXT[] DEFAULT ARRAY[]::TEXT[];
      ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_is_fallback BOOLEAN DEFAULT true;
      ALTER TABLE preferences ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

      CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_articles_canonical_link ON articles(canonical_link);
      CREATE INDEX IF NOT EXISTS idx_article_categories_category ON article_categories(category);
      CREATE INDEX IF NOT EXISTS idx_likes_anon_id ON likes(anon_id);
      CREATE INDEX IF NOT EXISTS idx_likes_article_id ON likes(article_id);
    `);
    initialized = true;
  } finally {
    client.release();
  }
}
