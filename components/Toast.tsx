'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect } from 'react';

export interface ToastState {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

export default function Toast({ toast, onDone }: { toast: ToastState | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onDone, toast.tone === 'error' ? 6000 : 3500);
    return () => window.clearTimeout(t);
  }, [toast, onDone]);

  if (!toast) return null;
  const Icon = toast.tone === 'ok' ? CheckCircle2 : XCircle;
  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className="glass animate-toast fixed bottom-6 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-full px-5 py-3 text-sm shadow-lg"
    >
      <Icon className={toast.tone === 'ok' ? 'h-5 w-5 text-mint' : 'h-5 w-5 text-rose'} strokeWidth={1.75} />
      <span className="text-fg">{toast.text}</span>
    </div>
  );
}
