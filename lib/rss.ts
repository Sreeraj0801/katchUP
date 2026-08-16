import Parser from "rss-parser";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const rssParser = new Parser({
  timeout: 15000,
  customFields: {
    item: [["content:encoded", "contentEncoded"]],
  },
});

export type RawArticle = {
  title: string;
  link: string;
  canonicalLink?: string;
  source: string;
  publishedAt?: Date;
  description?: string;
};

export type ExtractedArticle = RawArticle & {
  content: string;
  imageUrl?: string;
  imageIsFallback: boolean;
};

// Sources are grouped by the taxonomy areas they mostly feed. The LLM still
// does the actual classification; this list only controls topical coverage.
const FEEDS = [
  // Startups / Big Tech / general tech
  { url: "https://techcrunch.com/feed/", name: "TechCrunch" },
  { url: "https://www.theverge.com/rss/index.xml", name: "The Verge" },
  { url: "https://arstechnica.com/feed/", name: "Ars Technica" },
  { url: "https://www.wired.com/feed/rss", name: "WIRED" },
  { url: "https://news.ycombinator.com/rss", name: "Hacker News" },
  { url: "https://feeds.arstechnica.com/arstechnica/technology-lab", name: "Ars Technica Tech" },
  { url: "https://www.engadget.com/rss.xml", name: "Engadget" },

  // AI
  { url: "https://venturebeat.com/category/ai/feed/", name: "VentureBeat AI" },
  { url: "https://www.technologyreview.com/feed/", name: "MIT Tech Review" },
  { url: "https://feeds.feedburner.com/blogspot/gJZg", name: "Google AI Blog" },
  { url: "https://huggingface.co/blog/feed.xml", name: "Hugging Face" },

  // Cybersecurity
  { url: "https://krebsonsecurity.com/feed/", name: "Krebs on Security" },
  { url: "https://feeds.feedburner.com/TheHackersNews", name: "The Hacker News" },
  { url: "https://www.bleepingcomputer.com/feed/", name: "BleepingComputer" },

  // Markets / Economy / Personal finance
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", name: "MarketWatch" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", name: "CNBC" },
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", name: "CNBC Markets" },
  { url: "https://www.cnbc.com/id/10000115/device/rss/rss.html", name: "CNBC Economy" },
  { url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", name: "WSJ Markets" },
  { url: "https://www.investing.com/rss/news_25.rss", name: "Investing.com" },

  // Crypto
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", name: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", name: "Cointelegraph" },
  { url: "https://decrypt.co/feed", name: "Decrypt" },

  // Venture capital
  { url: "https://news.crunchbase.com/feed/", name: "Crunchbase News" },
  { url: "https://techcrunch.com/category/venture/feed/", name: "TechCrunch Venture" },

  // Gadgets & consumer tech
  { url: "https://www.androidauthority.com/feed/", name: "Android Authority" },
  { url: "https://9to5mac.com/feed/", name: "9to5Mac" },
  { url: "https://www.macrumors.com/MacRumors-All.xml", name: "MacRumors" },
];

const OPTIONAL_FEEDS = [
  { url: "https://bullrich.dev/tldr-rss/tech.rss", name: "TLDR Tech" },
  { url: "https://bullrich.dev/tldr-rss/ai.rss", name: "TLDR AI" },
  { url: "https://bullrich.dev/tldr-rss/crypto.rss", name: "TLDR Crypto" },
];

export async function fetchAllFeeds(): Promise<RawArticle[]> {
  const all = [...FEEDS, ...OPTIONAL_FEEDS];

  const perFeed = await Promise.all(
    all.map(async (feed) => {
      try {
        const parsed = await rssParser.parseURL(feed.url);
        const items: RawArticle[] = [];
        for (const item of parsed.items) {
          if (!item.title || !item.link) continue;
          items.push({
            title: item.title.trim(),
            link: item.link.trim(),
            canonicalLink: item.link.trim(),
            source: feed.name,
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            description: item.contentSnippet || item.contentEncoded || item.content || "",
          });
        }
        return items;
      } catch (err: any) {
        console.error(`Failed to fetch ${feed.url}: ${err?.message || err}`);
        return [] as RawArticle[];
      }
    })
  );

  // Interleave sources so one prolific feed cannot dominate the ingest batch.
  const results: RawArticle[] = [];
  const maxLen = Math.max(0, ...perFeed.map((f) => f.length));
  for (let i = 0; i < maxLen; i++) {
    for (const items of perFeed) {
      if (items[i]) results.push(items[i]);
    }
  }
  return results;
}

function extractImageUrl(doc: Document, baseUrl: string, fallback: string): { url?: string; isFallback: boolean } {
  const ogImage = doc.querySelector('meta[property="og:image"], meta[name="og:image"]')?.getAttribute("content");
  const twImage = doc.querySelector('meta[name="twitter:image"], meta[property="twitter:image"]')?.getAttribute("content");
  const firstImg = doc.querySelector("article img, .content img, main img, img");
  const firstImgSrc = firstImg?.getAttribute("src");

  const resolve = (u: string | null | undefined) => (u ? new URL(u, baseUrl).toString() : undefined);

  const url = resolve(ogImage) || resolve(twImage) || resolve(firstImgSrc);
  if (url) return { url, isFallback: false };
  return { url: resolve(fallback), isFallback: true };
}

function canonicalUrl(doc: Document, original: string): string {
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
  return canonical ? new URL(canonical, original).toString() : original;
}

export async function extractArticle(article: RawArticle): Promise<ExtractedArticle> {
  try {
    const response = await fetch(article.link, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KatchUP/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const doc = new JSDOM(html, { url: article.link });
    const reader = new Readability(doc.window.document);
    const parsed = reader.parse();
    const text = parsed?.textContent ?? "";

    const image = extractImageUrl(
      doc.window.document,
      article.link,
      `https://picsum.photos/seed/${encodeURIComponent(article.title)}/800/1200`
    );

    if (text.trim().length > 100) {
      return {
        ...article,
        canonicalLink: canonicalUrl(doc.window.document, article.link),
        content: text.trim(),
        imageUrl: image.url,
        imageIsFallback: image.isFallback,
      };
    }
  } catch (err) {
    console.error(`Extraction failed for ${article.link}:`, err);
  }

  const fallbackImage = `https://picsum.photos/seed/${encodeURIComponent(article.title)}/800/1200`;
  return {
    ...article,
    content: ((article.description || "") + "\n\n" + (article.title || "")).trim() || article.title,
    imageUrl: fallbackImage,
    imageIsFallback: true,
  };
}
