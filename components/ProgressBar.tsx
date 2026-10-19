'use client';

import { useEffect, useState } from 'react';

/** Thin violet bar that grows from 0 to `percent` on first view (700ms ease-out). */
export default function ProgressBar({ percent, label = true }: { percent: number; label?: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(percent));
    return () => cancelAnimationFrame(raf);
  }, [percent]);

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div
          className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-violet to-magenta transition-transform duration-700 ease-out"
          style={{ transform: `scaleX(${shown / 100})` }}
        />
      </div>
      {label && <span className="w-9 text-right text-xs tabular-nums text-violet-mist">{percent}%</span>}
    </div>
  );
}
