'use client';

// Registers the service worker that makes the app installable and keeps the shell
// available offline. Registration never blocks the UI, and a browser without service
// workers simply continues as a normal web app.

import { useEffect } from 'react';

export default function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // Register after the first paint so it never competes with loading a book.
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
