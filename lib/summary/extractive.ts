// Offline summary: picks the most representative sentences from the text. It needs no network
// and no API key. It is less fluent than the Claude summary, so the UI labels it as offline.

const STOPWORDS = new Set(
  (
    'a about above after again against all am an and any are as at be because been before being below between both but by ' +
    'can could did do does doing down during each few for from further had has have having he her here hers herself him himself ' +
    'his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ' +
    'ourselves out over own same she should so some such than that the their theirs them themselves then there these they this ' +
    'those through to too under until up very was we were what when where which while who whom why will with would you your ' +
    'yours yourself yourselves also one two may might must shall upon within without across among around'
  ).split(' '),
);

/** Splits prose into sentences. Abbreviations like "Dr." or "e.g." are kept intact where possible. */
export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const raw = cleaned.split(/(?<=[.!?])\s+(?=[A-Z0-9“"'(])/);
  return raw.map((s) => s.trim()).filter((s) => s.split(' ').length >= 4);
}

/** Returns up to `count` sentences in original order, ranked by how often their words appear in the text. */
export function summarizeOffline(text: string, count: number): string[] {
  const sentences = splitSentences(text);
  if (sentences.length <= count) return sentences;

  const freq = new Map<string, number>();
  for (const s of sentences) {
    for (const w of s.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
      if (!STOPWORDS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }

  const scored = sentences.map((s, index) => {
    const words = s.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
    const content = words.filter((w) => !STOPWORDS.has(w));
    const score = content.reduce((n, w) => n + (freq.get(w) ?? 0), 0) / Math.sqrt(content.length + 1);
    // Mild preference for the opening of the text, which often sets up the topic.
    const position = index < 3 ? 1.15 : 1;
    return { index, s, score: score * position };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.index - b.index)
    .map((x) => x.s);
}

export function offlineSummaryText(text: string, scope: 'chapter' | 'document'): string {
  const count = scope === 'chapter' ? 5 : 9;
  const picked = summarizeOffline(text, count);
  if (picked.length === 0) return 'There was not enough text to summarize.';
  return picked.map((s) => `• ${s}`).join('\n');
}
