#!/usr/bin/env node
/**
 * Local job runner for the ingest and retention tasks.
 *
 * Both jobs live behind HTTP routes so the exact same code path runs locally
 * and behind a real scheduler later (Vercel Cron, system cron, GitHub Actions).
 * This script just calls them against a running dev server.
 *
 *   npm run ingest            # pull new articles (default limit 40)
 *   npm run ingest -- 100     # pull up to 100
 *   npm run prune:dry         # show what retention WOULD remove
 *   npm run prune             # apply retention
 *   npm run jobs              # ingest, then prune
 *
 * Override the target with BASE_URL, e.g. BASE_URL=http://localhost:3001
 */

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;

const args = process.argv.slice(2);
const task = args[0] || "all";
const dry = args.includes("--dry");
const limit = args.find((a) => /^\d+$/.test(a)) || "40";

const headers = SECRET ? { authorization: `Bearer ${SECRET}` } : {};

const fmtBytes = (n) => {
  if (!Number.isFinite(n)) return "-";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
};

async function call(path, label) {
  const url = `${BASE}${path}`;
  const started = Date.now();
  process.stdout.write(`- ${label} ... `);
  let res;
  try {
    res = await fetch(url, { method: "POST", headers });
  } catch (err) {
    console.log("FAILED");
    console.error(`  Could not reach ${BASE}. Is the dev server running? (npm run dev)`);
    process.exit(1);
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { error: text.slice(0, 200) }; }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (!res.ok) {
    console.log(`FAILED (${res.status}, ${secs}s)`);
    console.error(`  ${body.error || text.slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`done (${secs}s)`);
  return body;
}

async function main() {
  console.log(`KatchUP jobs -> ${BASE}\n`);

  if (task === "ingest" || task === "all") {
    const r = await call(`/api/ingest?limit=${limit}`, `ingest (limit ${limit})`);
    console.log(`    inserted        : ${r.inserted} of ${r.total} candidates`);
    console.log(`    via Gemini      : ${r.classifiedByLlm ?? 0}`);
    console.log(`    via keywords    : ${r.classifiedByKeywords ?? 0}`);
    if (r.llmQuotaExhausted) {
      console.log(`    note            : Gemini quota exhausted, keyword fallback used`);
    }
    console.log("");
  }

  if (task === "prune" || task === "all") {
    const r = await call(`/api/cron/prune${dry ? "?dryRun=1" : ""}`, dry ? "prune (dry run)" : "prune");
    console.log(`    policy          : strip content >${r.stripAfterDays}d, delete >${r.deleteAfterDays}d (liked kept)`);
    console.log(`    content stripped: ${r.strippedContent}`);
    console.log(`    articles deleted: ${r.deletedArticles}`);
    if (r.dryRun) console.log(`    (dry run - nothing was changed)`);
    else console.log(`    db size         : ${fmtBytes(r.bytesBefore)} -> ${fmtBytes(r.bytesAfter)}`);
    console.log("");
  }

  if (!["ingest", "prune", "all"].includes(task)) {
    console.error(`Unknown task "${task}". Use: ingest | prune | all`);
    process.exit(1);
  }
}

main();
