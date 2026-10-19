import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Log in · Echo Shelf',
};

/**
 * "Log in" and "sign in" are the same action, so /login is an alias for /signin
 * rather than a second copy of the form. Anyone landing here keeps their ?next=.
 */
export default async function LogInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? params.next : undefined;
  // Only same-site paths, so a crafted link cannot carry the session somewhere else.
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  redirect(safe ? `/signin?next=${encodeURIComponent(safe)}` : '/signin');
}
