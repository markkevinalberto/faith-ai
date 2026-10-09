/**
 * Local semantic search: on-device sentence embeddings (all-MiniLM-L6-v2 via llama.cpp) rank
 * library articles and the user's own records by meaning. Keyword matches are always kept, so the
 * embedding model only ADDS recall; without it, search is keyword-only. Embeddings live in memory.
 *
 * Thresholds were calibrated against all-MiniLM-L6-v2 on FAITH's library and sample records:
 * unrelated text scores ~0.0–0.25, genuine matches ~0.35–0.65.
 */
import { LIBRARY, type KnowledgeArticle } from './knowledge/library';
import { searchLibrary } from './knowledge/search';

export interface Embedder {
  readonly id: string;
  embed(texts: string[]): Promise<number[][]>;
}

export const RECORD_MIN_SIMILARITY = 0.35;
export const LIBRARY_MIN_SIMILARITY = 0.38;

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class EmbeddingCache {
  private readonly map = new Map<string, number[]>();
  constructor(private readonly maxEntries = 2000) {}

  async get(embedder: Embedder, texts: string[]): Promise<number[][]> {
    const key = (t: string) => `${embedder.id}|${t}`;
    const missing = [...new Set(texts.filter((t) => !this.map.has(key(t))))];
    if (missing.length) {
      const vecs = await embedder.embed(missing);
      missing.forEach((t, i) => this.map.set(key(t), vecs[i]));
      while (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value as string);
    }
    return texts.map((t) => this.map.get(key(t)) as number[]);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Cleared on profile switch / data deletion so no record text outlives its profile in memory. */
export const sharedEmbeddingCache = new EmbeddingCache();

export interface SemanticDoc {
  id: string;
  text: string;
}

export async function rankBySimilarity(
  embedder: Embedder,
  query: string,
  docs: SemanticDoc[],
  opts: { k?: number; minScore?: number; cache?: EmbeddingCache } = {},
): Promise<{ id: string; score: number }[]> {
  if (docs.length === 0) return [];
  const cache = opts.cache ?? sharedEmbeddingCache;
  const [q] = await cache.get(embedder, [query]);
  const vecs = await cache.get(embedder, docs.map((d) => d.text));
  return docs
    .map((d, i) => ({ id: d.id, score: cosine(q, vecs[i]) }))
    .filter((r) => r.score >= (opts.minScore ?? RECORD_MIN_SIMILARITY))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, opts.k ?? 5);
}

export function articleText(a: KnowledgeArticle): string {
  return `${a.title}. ${a.aliases.join(', ')}. ${a.summary}`;
}

/**
 * Hybrid library search: every keyword match is kept, articles that match by meaning are added,
 * and the combined list is ranked by similarity plus a keyword boost.
 */
export async function hybridLibrarySearch(
  query: string,
  embedder: Embedder,
  opts: { k?: number; cache?: EmbeddingCache; library?: KnowledgeArticle[] } = {},
): Promise<KnowledgeArticle[]> {
  const library = opts.library ?? LIBRARY;
  const keyword = searchLibrary(query, library.length, library);
  const maxKw = keyword.reduce((m, r) => Math.max(m, r.score), 0) || 1;
  const kwScore = new Map(keyword.map((r) => [r.article.id, r.score / maxKw]));
  const sem = await rankBySimilarity(
    embedder,
    query,
    library.map((a) => ({ id: a.id, text: articleText(a) })),
    { k: library.length, minScore: -1, cache: opts.cache },
  );
  return sem
    .filter((s) => kwScore.has(s.id) || s.score >= LIBRARY_MIN_SIMILARITY)
    .map((s) => ({ id: s.id, score: s.score + 0.25 * (kwScore.get(s.id) ?? 0) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, opts.k ?? 2)
    .map((s) => library.find((a) => a.id === s.id) as KnowledgeArticle);
}
