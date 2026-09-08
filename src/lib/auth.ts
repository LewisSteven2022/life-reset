import 'server-only';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export type AppUser = { id: string; email: string };

export async function requireUser(): Promise<AppUser> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    redirect('/login');
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect('/login');
  return { id: data.user.id, email: data.user.email ?? '' };
}

export async function getOptionalUser(): Promise<AppUser | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? '' } : null;
}
