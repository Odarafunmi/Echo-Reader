'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/lib/theme/useTheme';

// Loaded on the client only, so Three.js stays out of the server render.
const BookScene = dynamic(() => import('./BookScene'), { ssr: false });
const CursorGlow = dynamic(() => import('./CursorGlow'), { ssr: false });

const MASK = 'radial-gradient(ellipse at center, #000 40%, transparent 100%)';

export default function SceneBackground() {
  const path = usePathname();
  const { theme } = useTheme();
  // The reader sets its own background and keeps the page still while people read.
  if (path?.startsWith('/read')) return null;
  return (
    <>
      <div
        aria-hidden
        className={
          'pointer-events-none fixed inset-0 z-0 ' + (theme === 'light' ? 'opacity-55' : 'opacity-70')
        }
        style={{ WebkitMaskImage: MASK, maskImage: MASK }}
      >
        <BookScene variant={theme} />
      </div>
      <CursorGlow />
    </>
  );
}
