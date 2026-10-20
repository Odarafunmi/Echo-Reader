import RequireProfile from '@/components/RequireProfile';
import TopNav from '@/components/TopNav';
import VoiceStudio from '@/components/VoiceStudio';

export default function VoicePage() {
  return (
    <RequireProfile>
      <TopNav current="voice" />
      <main>
        <VoiceStudio />
      </main>
    </RequireProfile>
  );
}
