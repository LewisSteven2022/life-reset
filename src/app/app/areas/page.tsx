import { listUserAreas } from '@/lib/data/areas';
import { AreaList } from './area-list';

export default async function AreasPage() {
  const areas = await listUserAreas();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Your areas</h1>
        <p className="text-stone-600">
          Hiding an area keeps every day you already finished for it. Habits are edited over on Plan.
        </p>
      </header>
      <AreaList areas={areas} />
    </div>
  );
}
