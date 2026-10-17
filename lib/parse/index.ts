import type { BookFormat, Chapter } from '../types';
import { parseDocx } from './docx';
import { parseEpub } from './epub';
import { parsePdf } from './pdf';
import { chaptersFromParagraphs, paragraphsFromPlain } from './text';

export const ACCEPTED_EXTENSIONS = ['.pdf', '.epub', '.docx', '.txt', '.md', '.markdown'];
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');

export interface ParsedBook {
  title: string;
  author: string;
  format: BookFormat;
  chapters: Chapter[];
}

const MAX_BYTES = 150 * 1024 * 1024;

export async function parseFile(file: File): Promise<ParsedBook> {
  const name = file.name;
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    throw new Error(`“${ext || name}” is not supported. Use PDF, EPUB, DOCX, TXT or MD.`);
  }
  if (file.size > MAX_BYTES) throw new Error('This file is over 150 MB.');

  const fallbackTitle = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled';

  let parsed: ParsedBook;
  if (ext === '.epub') {
    const r = await parseEpub(file);
    parsed = { title: r.title || fallbackTitle, author: r.author, format: 'epub', chapters: r.chapters };
  } else if (ext === '.pdf') {
    const r = await parsePdf(await file.arrayBuffer(), fallbackTitle);
    parsed = { title: r.title, author: '', format: 'pdf', chapters: r.chapters };
  } else if (ext === '.docx') {
    const chapters = await parseDocx(file, fallbackTitle);
    parsed = { title: fallbackTitle, author: '', format: 'docx', chapters };
  } else {
    const text = await file.text();
    const chapters = chaptersFromParagraphs(paragraphsFromPlain(text), fallbackTitle);
    parsed = {
      title: fallbackTitle,
      author: '',
      format: ext === '.txt' ? 'txt' : 'md',
      chapters,
    };
  }

  parsed.chapters = parsed.chapters.filter((c) => c.paragraphs.length > 0);
  if (parsed.chapters.length === 0) throw new Error('No readable text was found in this file.');
  return parsed;
}
