import type { Metadata } from 'next';
import ProfileForm from '@/components/ProfileForm';

export const metadata: Metadata = {
  title: 'Create your profile · Echo Shelf',
  description: 'Start your shelf. Your books, notes and voice stay in this browser, under your name.',
};

export default function SignUpPage() {
  return <ProfileForm mode="create" />;
}
