import type { MetadataRoute } from 'next';

/**
 * Makes Echo Shelf installable. With the service worker in public/sw.js this is what
 * lets the OS treat it as a media app: an icon on the home screen, a standalone
 * window, and narration that keeps running when the phone is locked.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Echo Shelf',
    short_name: 'Echo Shelf',
    description: 'Your books, your way. Read in your own voice.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0A0A0F',
    theme_color: '#0A0A0F',
    categories: ['books', 'education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Maskable icons are cropped to the launcher's shape, so this one has a
      // safe-zone-sized mark. Reusing the full-bleed icon here would lose its edges.
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
