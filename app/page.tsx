import RequireProfile from '@/components/RequireProfile';
import Shelf from '@/components/Shelf';
import TopNav from '@/components/TopNav';

export default function Home() {
  return (
    <RequireProfile>
      <TopNav current="library" />
      <main>
        <Shelf />
      </main>
    </RequireProfile>
  );
}
