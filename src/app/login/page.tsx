'use client';

import { Suspense, useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
      {state.error ? <p className="text-sm text-ember">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-semibold">Welcome back</h1>
        <p className="text-quiet">Pick up wherever you left the day.</p>
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <p className="text-center text-sm text-quiet">
        New here? <Link href="/signup" className="underline decoration-mark underline-offset-4">Start your reset</Link>
      </p>
    </main>
  );
}
