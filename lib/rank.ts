import { Category } from "./categories";

export type RankedArticle = {
  id: number;
  title: string;
  link: string;
  source: string;
  published_at: string;
  summary: string;
  tldr_bullets: string[];
  content?: string;
  image_url: string | null;
  image_is_fallback: boolean;
  categories: { category: Category; score: number }[];
  final_score: number;
  liked: boolean;
};

export const THRESHOLD = 0.4;
export const AFFINITY_WEIGHT = 0.4;

export function scoreArticle(
  article: any,
  selectedCategories: string[],
  likeCounts: Record<string, number>,
  totalLikes: number
): number | null {
  const matched = article.categories.filter(
    (c: any) => selectedCategories.includes(c.category) && c.score >= THRESHOLD
  );
  if (matched.length === 0) return null;

  const maxRelevance = Math.max(...matched.map((c: any) => c.score));

  const hoursAgo =
    (Date.now() - new Date(article.published_at).getTime()) / (1000 * 60 * 60);
  const recencyScore = Math.max(0.05, Math.exp(-hoursAgo / 48));

  let categoryAffinity = 0;
  for (const c of matched) {
    const count = likeCounts[c.category] || 0;
    if (totalLikes > 0) {
      categoryAffinity += (count / totalLikes) * c.score;
    }
  }
  const affinityBonus = 1 + AFFINITY_WEIGHT * Math.min(1, categoryAffinity);

  return recencyScore * maxRelevance * affinityBonus;
}

export function rankArticles(
  articles: any[],
  selectedCategories: string[],
  likeCounts: Record<string, number>,
  totalLikes: number,
  likedIds: Set<number>
): RankedArticle[] {
  const scored = articles
    .map((a) => {
      const score = scoreArticle(a, selectedCategories, likeCounts, totalLikes);
      if (score === null) return null;
      return {
        id: a.id,
        title: a.title,
        link: a.link,
        source: a.source,
        published_at: a.published_at,
        summary: a.summary,
        tldr_bullets: a.tldr_bullets || [],
        content: a.content,
        image_url: a.image_url,
        image_is_fallback: a.image_is_fallback,
        categories: a.categories,
        final_score: score,
        liked: likedIds.has(a.id),
      } as RankedArticle;
    })
    .filter(Boolean) as RankedArticle[];

  scored.sort((a, b) => b.final_score - a.final_score);
  return scored;
}
