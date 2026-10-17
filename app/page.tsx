import Shelf from '@/components/Shelf';
import TopNav from '@/components/TopNav';

export default function Home() {
  return (
    <>
      <TopNav current="library" />
      <main>
        <Shelf />
      </main>
    </>
  );
}
