import type { Metadata } from 'next';
import ProfileForm from '@/components/ProfileForm';

export const metadata: Metadata = {
  title: 'Sign in · Echo Shelf',
  description: 'Pick a profile stored in this browser, or add a new one.',
};

export default function SignInPage() {
  return <ProfileForm mode="choose" />;
}
