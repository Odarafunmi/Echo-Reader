import TopNav from '@/components/TopNav';
import VoiceStudio from '@/components/VoiceStudio';

export default function VoicePage() {
  return (
    <>
      <TopNav current="voice" />
      <main>
        <VoiceStudio />
      </main>
    </>
  );
}
