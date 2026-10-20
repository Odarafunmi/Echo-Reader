import Reader from '@/components/Reader';
import RequireProfile from '@/components/RequireProfile';

export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RequireProfile>
      <Reader id={id} />
    </RequireProfile>
  );
}
