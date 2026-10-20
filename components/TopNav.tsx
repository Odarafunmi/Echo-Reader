import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import ProfileMenu from './ProfileMenu';
import ThemeToggle from './ThemeToggle';

export type NavSection = 'library' | 'notes' | 'voice';

const tabs: { id: NavSection; label: string; short: string; href: string }[] = [
  { id: 'library', label: 'My Library', short: 'Library', href: '/' },
  { id: 'notes', label: 'Notes', short: 'Notes', href: '/notes' },
  { id: 'voice', label: 'Voice Studio', short: 'Voice', href: '/voice' },
];

/**
 * The top bar. On a phone it is two rows: the brand and account controls, then the
 * three tabs stretched across the full width. The tabs never wrap and never break a
 * word: each is `flex-1`, `whitespace-nowrap`, and uses its short label below `sm`,
 * which keeps all three on one line down to a 320px screen.
 */
export default function TopNav({ current }: { current: NavSection }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap sm:px-6 sm:py-4">
        <Link
          href="/"
          className="mr-auto flex min-w-0 items-center gap-2 font-display text-base font-semibold tracking-tight sm:text-lg"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet to-magenta shadow-glow">
            <BookOpen className="h-4 w-4 text-white" strokeWidth={1.75} />
          </span>
          <span className="truncate">Echo Shelf</span>
        </Link>

        <div className="order-2 flex shrink-0 items-center gap-1.5 sm:order-none sm:gap-2">
          <ThemeToggle />
          <ProfileMenu />
        </div>

        <nav
          aria-label="Main"
          className="order-3 flex w-full items-center gap-1 rounded-full border border-line bg-card p-1 sm:order-none sm:w-auto sm:shrink-0"
        >
          {tabs.map((t) => {
            const active = t.id === current;
            return (
              <Link
                key={t.id}
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={
                  'flex-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-center text-[13px] font-medium leading-5 transition-colors duration-250 ease-soft sm:flex-none sm:px-4 sm:text-sm ' +
                  (active ? 'bg-violet text-white shadow-glow' : 'text-fg-2 hover:text-fg')
                }
              >
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
