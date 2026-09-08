'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export type AuthFormState = { error: string | null };

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || password.length < 8) {
    return { error: 'Enter an email and a password of at least 8 characters.' };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  redirect('/app');
}
