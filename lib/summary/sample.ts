/**
 * Keeps long text within a budget by taking evenly spaced slices across the whole text,
 * so the summary still reflects the middle and end of a chapter, not just its opening.
 */
export function sampleText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const slices = 8;
  const sliceLen = Math.floor(maxChars / slices);
  const parts: string[] = [];
  for (let i = 0; i < slices; i++) {
    const start = Math.floor((i * (text.length - sliceLen)) / (slices - 1));
    // Start each slice at a word boundary.
    const from = start === 0 ? 0 : text.indexOf(' ', start) + 1 || start;
    parts.push(text.slice(from, from + sliceLen).trim());
  }
  return parts.join('\n\n[…]\n\n');
}
