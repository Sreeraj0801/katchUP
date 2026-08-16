import { TAXONOMY } from "./categories";
import type { Classification } from "./gemini";

/**
 * Keyword signals per taxonomy category. Used only when the LLM is
 * unavailable (quota exhausted / outage) so ingestion keeps working and the
 * feed still fills up. Scores are intentionally capped below the confidence
 * an LLM classification gets.
 */
const SIGNALS: Record<string, string[]> = {
  AI: [
    "artificial intelligence", " ai ", "ai-", "llm", "gpt", "chatgpt", "openai", "anthropic",
    "claude", "gemini", "machine learning", "neural", "deep learning", "model training",
    "inference", "hugging face", "copilot", "deepmind", "agentic", "transformer",
  ],
  Startups: [
    "startup", "founder", "seed round", "series a", "series b", "series c", "y combinator",
    "accelerator", "incubator", "early-stage", "bootstrapped", "pitch deck",
  ],
  "Big Tech": [
    "google", "alphabet", "apple", "microsoft", "amazon", "meta", "facebook", "netflix",
    "nvidia", "tesla", "antitrust", "tiktok", "bytedance", "oracle", "salesforce",
  ],
  Cybersecurity: [
    "security", "breach", "hacker", "hacking", "ransomware", "malware", "phishing",
    "vulnerability", "cve-", "zero-day", "exploit", "ddos", "encryption", "data leak",
    "cyberattack", "botnet", "spyware",
  ],
  "Gadgets & Consumer Tech": [
    "smartphone", "iphone", "android", "laptop", "tablet", "wearable", "smartwatch",
    "headphone", "earbuds", "review", "gadget", "hands-on", "camera", "console", "gpu",
    "cpu", "monitor", "smart home",
  ],
  "Markets & Stocks": [
    "stock", "shares", "s&p", "nasdaq", "dow jones", "earnings", "ipo", "market cap",
    "bull market", "bear market", "rally", "sell-off", "ticker", "equities", "dividend",
    "wall street", "index fund", "etf",
  ],
  Crypto: [
    "crypto", "bitcoin", "ethereum", "blockchain", "token", "defi", "nft", "stablecoin",
    "web3", "binance", "coinbase", "solana", "altcoin", "mining rig", "wallet address",
  ],
  "Personal Finance": [
    "savings", "retirement", "401(k)", "ira ", "mortgage", "credit card", "budgeting",
    "personal finance", "debt", "student loan", "insurance", "tax return", "emergency fund",
    "money market", "financial advisor",
  ],
  "Economy & Policy": [
    "inflation", "federal reserve", "interest rate", "gdp", "unemployment", "recession",
    "tariff", "regulation", "policy", "central bank", "treasury", "fiscal", "monetary",
    "jobs report", "congress", "legislation", "sanctions",
  ],
  "Venture Capital": [
    "venture capital", " vc ", "funding round", "raised $", "valuation", "term sheet",
    "limited partner", "portfolio company", "sequoia", "andreessen", "a16z", "cap table",
    "dry powder",
  ],
};

function firstSentences(text: string, count: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  return parts.slice(0, count).join(" ").trim();
}

/**
 * Heuristic stand-in for `summarizeAndClassify`. Never throws.
 */
export function classifyWithKeywords(
  title: string,
  text: string,
  description?: string
): { summary: string; tldr: string[]; categories: Classification[] } {
  const haystack = ` ${`${title} ${text.slice(0, 4000)}`.toLowerCase()} `;

  const scored = TAXONOMY.map((category) => {
    const words = SIGNALS[category] || [];
    let hits = 0;
    for (const w of words) if (haystack.includes(w)) hits++;
    return { category, hits };
  })
    .filter((c) => c.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3);

  if (scored.length === 0) return { summary: "", tldr: [], categories: [] };

  const max = scored[0].hits;
  const categories: Classification[] = scored.map((c) => ({
    category: c.category,
    // Cap at 0.8 so genuine LLM classifications always outrank heuristics.
    score: Math.min(0.8, 0.45 + 0.35 * (c.hits / max)),
  }));

  const base = (description || "").replace(/<[^>]*>/g, " ").trim();
  const summary = firstSentences(base.length > 80 ? base : text, 3) || title;

  return { summary, tldr: [], categories };
}
