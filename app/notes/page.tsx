import NotesOverview from '@/components/NotesOverview';
import TopNav from '@/components/TopNav';

export default function NotesPage() {
  return (
    <>
      <TopNav current="notes" />
      <main>
        <NotesOverview />
      </main>
    </>
  );
}
