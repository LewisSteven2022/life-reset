'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signUp, type AuthFormState } from './actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';

const initial: AuthFormState = { error: null };

export default function SignUpPage() {
  const [state, action, pending] = useActionState(signUp, initial);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Start your reset</h1>
        <p className="text-stone-600">Twenty-one days, from wherever you are today.</p>
      </div>
      <form action={action} className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create account'}</Button>
      </form>
      <p className="text-center text-sm text-stone-500">
        Already started? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </main>
  );
}
