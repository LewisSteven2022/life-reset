import { redirect } from 'next/navigation';
import { listAreaCatalogue } from '@/lib/data/catalogue';
import { listUserAreas } from '@/lib/data/areas';
import { getOpenProgramme, listProgrammeHabits } from '@/lib/data/programme';
import { AreasStep } from './areas-step';
import { PlanStep } from './plan-step';
import { GeneratePlanForm } from './generate-plan-form';

export default async function SetupPage() {
  const programme = await getOpenProgramme();
  if (programme?.status === 'active') redirect('/app');

  const [catalogue, areas] = await Promise.all([listAreaCatalogue(), listUserAreas()]);
  const habits = programme ? await listProgrammeHabits(programme.id) : [];

  if (programme && habits.length > 0) {
    return <PlanStep programmeId={programme.id} habits={habits} />;
  }

  if (programme && areas.length > 0) {
    return <GeneratePlanForm areaCount={areas.length} />;
  }

  return (
    <AreasStep
      catalogue={catalogue}
      selected={areas.filter((a) => !a.isCustom && a.areaKey).map((a) => a.areaKey!)}
      customAreas={areas.filter((a) => a.isCustom)}
    />
  );
}
