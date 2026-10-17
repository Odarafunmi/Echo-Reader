// EPUB: a zip of XHTML documents. Each spine item becomes a chapter.
import type { Chapter } from '../types';

const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,dt,dd';

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function resolvePath(base: string, href: string): string {
  const cleanHref = href.split('#')[0];
  const url = new URL(cleanHref, `https://epub.local/${base}`);
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

function textOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export async function parseEpub(
  file: File,
): Promise<{ title: string; author: string; chapters: Chapter[] }> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(file);

  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('This EPUB has no container.xml, so it is not valid.');
  const rootPath = parseXml(containerXml).querySelector('rootfile')?.getAttribute('full-path');
  if (!rootPath) throw new Error('Could not find the EPUB package file.');

  const opfDir = rootPath.includes('/') ? rootPath.slice(0, rootPath.lastIndexOf('/') + 1) : '';
  const opf = parseXml(await zip.file(rootPath)!.async('string'));

  const title = textOf(opf.getElementsByTagNameNS('*', 'title')[0] ?? opf.createElement('x'));
  const author = textOf(opf.getElementsByTagNameNS('*', 'creator')[0] ?? opf.createElement('x'));

  const manifest = new Map<string, string>();
  for (const item of Array.from(opf.getElementsByTagNameNS('*', 'item'))) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, href);
  }

  const spineIds = Array.from(opf.getElementsByTagNameNS('*', 'itemref'))
    .map((r) => r.getAttribute('idref'))
    .filter((x): x is string => !!x);

  const chapters: Chapter[] = [];
  let untitled = 0;

  for (const idref of spineIds) {
    const href = manifest.get(idref);
    if (!href) continue;
    const entry = zip.file(resolvePath(opfDir, href));
    if (!entry) continue;

    const html = await entry.async('string');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body;
    if (!body) continue;

    const blocks = Array.from(body.querySelectorAll(BLOCK_SELECTOR)).filter(
      // Keep only the outermost block, so nested <p> inside <li> are not counted twice.
      (el) => !el.parentElement?.closest(BLOCK_SELECTOR),
    );

    const heading = blocks.find((el) => /^H[1-3]$/.test(el.tagName) && textOf(el));
    const docTitle = textOf(doc.querySelector('title') ?? doc.createElement('x'));
    let chapterTitle = heading ? textOf(heading) : docTitle;
    if (!chapterTitle) chapterTitle = `Section ${++untitled}`;

    const paragraphs = blocks
      .filter((el) => el !== heading)
      .map(textOf)
      .filter((t) => t.length > 0);

    if (paragraphs.length === 0) continue;
    chapters.push({ title: chapterTitle, paragraphs });
  }

  if (chapters.length === 0) throw new Error('No readable text was found in this EPUB.');
  return { title, author, chapters };
}

