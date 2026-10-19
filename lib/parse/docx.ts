// DOCX via Mammoth. Word has no reliable chapter markers, so headings are detected from text.
import type { Chapter } from '../types';
import { chaptersFromParagraphs } from './text';

export async function parseDocx(file: File, fallbackTitle: string): Promise<Chapter[]> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const paragraphs = result.value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return chaptersFromParagraphs(paragraphs, fallbackTitle);
}
