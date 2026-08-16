const FALLBACK_PALETTE: Record<string, { bg: string; fg: string }> = {
  AI: { bg: "1e1b4b", fg: "ffffff" },
  Startups: { bg: "0c4a6e", fg: "ffffff" },
  "Big Tech": { bg: "111827", fg: "ffffff" },
  Cybersecurity: { bg: "064e3b", fg: "ffffff" },
  "Gadgets & Consumer Tech": { bg: "7c2d12", fg: "ffffff" },
  "Markets & Stocks": { bg: "365314", fg: "ffffff" },
  Crypto: { bg: "4c1d95", fg: "ffffff" },
  "Personal Finance": { bg: "064e3b", fg: "ffffff" },
  "Economy & Policy": { bg: "451a03", fg: "ffffff" },
  "Venture Capital": { bg: "312e81", fg: "ffffff" },
};

/**
 * When an article has no artwork, use a stable per-category stock photo.
 * The client still renders the category gradient and scrim over it, so the
 * result is on-brand while guaranteeing the reel/reader never shows an empty
 * card. The image is deterministic per category so the same category does not
 * get a random new photo on every load.
 */
export function fallbackImageUrl(category: string, _title: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(category || "news")}/800/1200`;
}

export function chartColor(category: string): string {
  switch (category) {
    case "AI":
      return "hsl(var(--chart-1))";
    case "Startups":
    case "Markets & Stocks":
      return "hsl(var(--chart-2))";
    case "Big Tech":
    case "Crypto":
      return "hsl(var(--chart-3))";
    case "Cybersecurity":
    case "Personal Finance":
      return "hsl(var(--chart-4))";
    case "Gadgets & Consumer Tech":
    case "Economy & Policy":
      return "hsl(var(--chart-5))";
    default:
      return "hsl(var(--chart-1))";
  }
}
