'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { signIn, type AuthFormState } from './actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';

const initial: AuthFormState = { error: null };

function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  const next = useSearchParams().get('next') ?? '/app';

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold">Welcome back</h1>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <p className="text-center text-sm text-stone-500">
        New here? <Link href="/signup" className="underline">Start your reset</Link>
      </p>
    </main>
  );
}
