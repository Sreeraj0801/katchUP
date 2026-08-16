export const TAXONOMY = [
  "AI",
  "Startups",
  "Big Tech",
  "Cybersecurity",
  "Gadgets & Consumer Tech",
  "Markets & Stocks",
  "Crypto",
  "Personal Finance",
  "Economy & Policy",
  "Venture Capital",
] as const;

export type Category = (typeof TAXONOMY)[number];

export const CATEGORY_META: Record<
  Category,
  { icon: string; chart: number }
> = {
  AI: { icon: "Cpu", chart: 1 },
  Startups: { icon: "Rocket", chart: 2 },
  "Big Tech": { icon: "Building2", chart: 3 },
  Cybersecurity: { icon: "Shield", chart: 4 },
  "Gadgets & Consumer Tech": { icon: "Smartphone", chart: 5 },
  "Markets & Stocks": { icon: "TrendingUp", chart: 1 },
  Crypto: { icon: "Bitcoin", chart: 2 },
  "Personal Finance": { icon: "Wallet", chart: 3 },
  "Economy & Policy": { icon: "Landmark", chart: 4 },
  "Venture Capital": { icon: "Handshake", chart: 5 },
};

export function categoryChartClass(category: string) {
  const c = category as Category;
  const chart = CATEGORY_META[c]?.chart ?? 1;
  return `chart-${chart}`;
}
