import { redirect } from 'next/navigation';
import { listAreaCatalogue } from '@/lib/data/catalogue';
import { listUserAreas } from '@/lib/data/areas';
import { getOpenProgramme, listProgrammeHabits } from '@/lib/data/programme';
import { AreasStep } from './areas-step';
import { PlanStep } from './plan-step';
import { GeneratePlanForm } from './generate-plan-form';

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const programme = await getOpenProgramme();
  if (programme?.status === 'active') redirect('/app');

  const ready = (await searchParams).ready === '1';
  const [catalogue, areas] = await Promise.all([listAreaCatalogue(), listUserAreas()]);
  const habits = programme ? await listProgrammeHabits(programme.id) : [];

  if (programme && habits.length > 0) {
    return <PlanStep programmeId={programme.id} habits={habits} />;
  }

  // Custom areas are added on the picker. Do not skip that screen until the
  // user confirms with "Build my plan" (ready=1).
  if (programme && areas.length > 0 && ready) {
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
