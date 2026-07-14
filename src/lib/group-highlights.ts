import { ArticleWithHighlights, RaindropHighlight } from './types';

export function groupHighlightsByArticle(highlights: RaindropHighlight[]): ArticleWithHighlights[] {
  const articleMap = new Map<string, ArticleWithHighlights>();

  for (const h of highlights) {
    const key = h.link;
    if (!articleMap.has(key)) {
      let domain: string;
      try {
        domain = new URL(h.link).hostname;
      } catch {
        domain = h.link;
      }

      articleMap.set(key, {
        sourceUrl: h.link,
        title: h.title || h.link,
        domain,
        highlights: [],
        lastUpdate: h.lastUpdate || h.created,
      });
    }

    articleMap.get(key)!.highlights.push(h);
  }

  // Sort highlights within each article by creation time (oldest first)
  // so they appear in the same order as in the source text.
  for (const article of articleMap.values()) {
    article.highlights.sort(
      (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()
    );
  }

  return Array.from(articleMap.values());
}
