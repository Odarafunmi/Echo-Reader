'use client';

import { Check, Copy, Download, RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { listSummaries } from '@/lib/db';
import { DOC_SCOPE, chapterScope, generateSummary, SummaryUnavailableError } from '@/lib/summary/client';
import type { Book, Summary } from '@/lib/types';

interface Props {
  book: Book;
  currentChapter: number;
  onClose: () => void;
}

export default function SummaryPanel({ book, currentChapter, onClose }: Props) {
  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  const [scope, setScope] = useState<string>(() =>
    book.chapters.length <= 3 ? DOC_SCOPE : chapterScope(currentChapter),
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    listSummaries(book.id)
      .then(setSummaries)
      .catch(() => setSummaries([]));
  }, [book.id]);

  const current = useMemo(() => summaries?.find((s) => s.scope === scope) ?? null, [summaries, scope]);

  const scopeLabel = (s: string) => (s === DOC_SCOPE ? 'Whole book' : book.chapters[Number(s.slice(3))]?.title ?? 'Chapter');

  async function run() {
    setBusy(true);
    setError(null);
    setStatus('Reading the text…');
    try {
      await generateSummary(book, scope, setStatus);
      // A whole-book run also stores the chapter summaries it built, so reload everything.
      setSummaries(await listSummaries(book.id));
    } catch (e) {
      setError(e instanceof SummaryUnavailableError ? e.message : 'Something went wrong while summarising. Please try again.');
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  async function copy() {
    if (!current) return;
    await navigator.clipboard.writeText(current.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    if (!current) return;
    const body = `# ${book.title}: ${scopeLabel(scope)}\n\n${current.text}\n`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book.title.replace(/[^\w-]+/g, '_')}-${scope.replace(':', '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const lines = current ? current.text.split('\n').filter((l) => l.trim().length > 0) : [];

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close summary" className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Smart summary"
        className="glass animate-slide-in absolute right-0 top-0 flex h-full w-[min(480px,100%)] flex-col"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">Smart summary</p>
            <h2 className="font-display text-2xl font-semibold">Summaries</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="border-b border-line px-6 py-4">
          <div role="tablist" aria-label="Summary scope" className="flex gap-2 overflow-x-auto pb-1">
            {[DOC_SCOPE, ...book.chapters.map((_, i) => chapterScope(i))].map((s) => {
              const active = s === scope;
              const has = summaries?.some((x) => x.scope === s);
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setScope(s);
                    setError(null);
                  }}
                  className={
                    'shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors duration-300 ease-soft ' +
                    (active
                      ? 'border-violet bg-violet text-white shadow-glow'
                      : 'border-line text-fg-2 hover:border-violet/40 hover:text-fg')
                  }
                >
                  {scopeLabel(s)}
                  {has && <Check className="ml-1 inline h-3 w-3 text-mint" strokeWidth={2.5} aria-label="summarised" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {summaries === null && <p className="text-sm text-fg-3">Loading summaries…</p>}

          {summaries !== null && busy && (
            <div className="space-y-3" aria-live="polite">
              <p className="flex items-center gap-2 text-sm text-violet-mist">
                <Sparkles className="h-4 w-4 animate-pulse" strokeWidth={1.75} /> {status || 'Writing your summary…'}
              </p>
              {[92, 84, 96, 70, 88].map((w, i) => (
                <div key={i} className="h-3.5 animate-pulse rounded-full bg-raised" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}

          {summaries !== null && !busy && current && (
            <article className="card-sheen p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                {current.source === 'ai' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan/40 bg-cyan/10 px-2.5 py-1 text-xs font-semibold text-cyan">
                    <Sparkles className="h-3 w-3" strokeWidth={2} /> AI Summary
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-fg-2" title="Built from the most representative sentences. Connect AI summaries for a fuller result.">
                    Offline summary
                  </span>
                )}
                <div className="flex gap-1">
                  <button type="button" className="icon-btn h-9 w-9" aria-label="Copy summary" onClick={copy}>
                    {copied ? <Check className="h-4 w-4 text-mint" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
                  </button>
                  <button type="button" className="icon-btn h-9 w-9" aria-label="Download as Markdown" onClick={download}>
                    <Download className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              <div className="space-y-3 text-[15px] leading-7 text-fg">
                {lines.map((line, i) => (
                  <p
                    key={i}
                    className="animate-fade-up"
                    style={{ animationDelay: `${Math.min(i, 12) * 90}ms`, paddingLeft: line.startsWith('•') ? '0.25rem' : undefined }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </article>
          )}

          {summaries !== null && !busy && !current && (
            <div className="card-sheen flex flex-col items-center gap-4 px-6 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-cyan/10 text-cyan">
                <Sparkles className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div>
                <p className="font-display text-xl font-semibold">{scopeLabel(scope)}</p>
                <p className="mt-1 text-sm text-fg-3">
                  {scope === DOC_SCOPE
                    ? 'A short overview and the key points of the whole book.'
                    : 'The main points of this chapter and a one-line takeaway.'}
                </p>
              </div>
              <button type="button" className="btn-primary" onClick={run}>
                <Sparkles className="h-4 w-4" strokeWidth={1.75} /> Create summary
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-input border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-fg">
              {error}
            </p>
          )}
        </div>

        {summaries !== null && !busy && current && (
          <div className="border-t border-line p-6">
            <button type="button" className="btn-ghost w-full" onClick={run}>
              <RefreshCw className="h-4 w-4" strokeWidth={1.75} /> Regenerate
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
