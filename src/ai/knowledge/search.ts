/** Small, dependency-free keyword search over the offline library (and reusable for records). */
import { LIBRARY, type KnowledgeArticle } from './library';

const STOPWORDS = new Set(
  'a an and are as at be by can do does for from has have how i in is it its me my of on or our should so tell than that the their them then there these this to was what when where which who why will with you your about explain mean means meaning define definition'.split(
    ' ',
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080))
    .split(/[^a-z0-9/%.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export interface ScoredArticle {
  article: KnowledgeArticle;
  score: number;
}

/**
 * Scores articles: exact alias phrase match is strongest, then title/tag/body token overlap.
 * Deterministic ordering (score desc, then id).
 */
export function searchLibrary(query: string, limit = 3, library: KnowledgeArticle[] = LIBRARY): ScoredArticle[] {
  const q = query.toLowerCase();
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0 && q.trim().length === 0) return [];
  const results: ScoredArticle[] = [];
  for (const article of library) {
    let score = 0;
    for (const alias of article.aliases) {
      const re = new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
      if (re.test(q)) score += 10 + alias.length / 10;
    }
    const titleTokens = new Set(tokenize(article.title));
    const tagTokens = new Set(article.tags.flatMap(tokenize));
    const bodyTokens = new Set(tokenize(`${article.summary} ${article.body}`));
    for (const t of qTokens) {
      if (titleTokens.has(t)) score += 3;
      if (tagTokens.has(t)) score += 2;
      if (bodyTokens.has(t)) score += 0.5;
    }
    if (score > 0) results.push({ article, score });
  }
  return results
    .sort((a, b) => (b.score === a.score ? a.article.id.localeCompare(b.article.id) : b.score - a.score))
    .filter((r, i, arr) => r.score >= 2 || (i === 0 && arr.length > 0 && r.score >= 1))
    .slice(0, limit);
}
