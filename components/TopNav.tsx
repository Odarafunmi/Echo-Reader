import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import ProfileMenu from './ProfileMenu';
import ThemeToggle from './ThemeToggle';

export type NavSection = 'library' | 'notes' | 'voice';

const tabs: { id: NavSection; label: string; href: string }[] = [
  { id: 'library', label: 'My Library', href: '/' },
  { id: 'notes', label: 'Notes', href: '/notes' },
  { id: 'voice', label: 'Voice Studio', href: '/voice' },
];

export default function TopNav({ current }: { current: NavSection }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet to-magenta shadow-glow">
            <BookOpen className="h-4 w-4 text-white" strokeWidth={1.75} />
          </span>
          Echo Shelf
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 rounded-full border border-line bg-card p-1">
          {tabs.map((t) => {
            const active = t.id === current;
            return (
              <Link
                key={t.id}
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-250 ease-soft ' +
                  (active ? 'bg-violet text-white shadow-glow' : 'text-fg-2 hover:text-fg')
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
