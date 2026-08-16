import { NewsReel } from "@/app/components/NewsReel";

export default function ArticlePage({ params }: { params: { id: string } }) {
  return <NewsReel articleId={params.id} />;
}
