import { requireUser } from '@/lib/auth';

export default async function TodayPage() {
  const user = await requireUser();
  return <p className="text-stone-600">Signed in as {user.email}.</p>;
}
