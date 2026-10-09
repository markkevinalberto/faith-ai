import { EmbeddingCache, cosine, hybridLibrarySearch, rankBySimilarity, type Embedder } from '@/ai/semantic';

/** Deterministic fake embedder: bag of concept dimensions with a small synonym table. */
const CONCEPTS: Record<string, string[]> = {
  glucose: ['glucose', 'sugar', 'blood sugar', 'hba1c', 'a1c'],
  meal: ['meal', 'eating', 'ate', 'lunch', 'dinner', 'postprandial', 'after-meal', 'after meal'],
  low: ['low', 'hypo', 'shaky', 'hypoglycaemia', 'hypoglycemia'],
  high: ['high', 'hyper', 'ketones'],
  pressure: ['pressure', 'bp', 'systolic', 'diastolic', 'hypertension'],
  kidney: ['kidney', 'egfr', 'creatinine', 'uacr'],
  medicine: ['medicine', 'medication', 'dose', 'pill', 'tablet'],
};
const KEYS = Object.keys(CONCEPTS);
class FakeEmbedder implements Embedder {
  readonly id = 'fake';
  calls = 0;
  async embed(texts: string[]) {
    this.calls++;
    return texts.map((t) => {
      const lower = t.toLowerCase();
      return KEYS.map((k) => CONCEPTS[k].filter((w) => lower.includes(w)).length + 0.01);
    });
  }
}

describe('semantic search', () => {
  it('computes cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it('ranks records by meaning, not exact words', async () => {
    const r = await rankBySimilarity(new FakeEmbedder(), 'my sugar was high after lunch', [
      { id: 'bp', text: 'Blood pressure 138/86 mmHg' },
      { id: 'pp', text: 'Glucose 212 mg/dL after meal' },
      { id: 'kid', text: 'eGFR 78 kidney function' },
    ], { cache: new EmbeddingCache() });
    expect(r[0].id).toBe('pp');
    expect(r.find((x) => x.id === 'kid')).toBeUndefined();
  });

  it('caches embeddings so repeated searches do not re-embed', async () => {
    const e = new FakeEmbedder();
    const cache = new EmbeddingCache();
    const docs = [{ id: 'a', text: 'glucose fasting' }];
    await rankBySimilarity(e, 'sugar', docs, { cache });
    await rankBySimilarity(e, 'sugar', docs, { cache });
    expect(e.calls).toBe(2); // first call: query, second: docs; third search hits the cache
    expect(cache.size).toBe(2);
  });

  it('hybrid library search finds the right article for a paraphrased question', async () => {
    const articles = await hybridLibrarySearch('why do I feel shaky when my sugar drops low?', new FakeEmbedder(), { cache: new EmbeddingCache() });
    expect(articles[0].id).toBe('hypoglycemia');
  });
});
