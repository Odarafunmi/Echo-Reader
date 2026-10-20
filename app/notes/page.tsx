import NotesOverview from '@/components/NotesOverview';
import RequireProfile from '@/components/RequireProfile';
import TopNav from '@/components/TopNav';

export default function NotesPage() {
  return (
    <RequireProfile>
      <TopNav current="notes" />
      <main>
        <NotesOverview />
      </main>
    </RequireProfile>
  );
}
