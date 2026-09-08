'use client';

import { useActionState } from 'react';
import { saveReflection, type ReflectState } from './actions';
import { Button } from '@/components/ui/button';

const initial: ReflectState = { error: null, saved: false };

export function ReflectionForm({ dayIndex, prompt, body }: { dayIndex: number; prompt: string; body: string }) {
  const [state, action, pending] = useActionState(saveReflection, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="dayIndex" value={dayIndex} />
      <p className="text-lg leading-relaxed text-stone-700">{prompt}</p>
      <textarea
        name="body"
        defaultValue={body}
        rows={10}
        className="w-full rounded-2xl border border-stone-300 bg-white p-4 text-base outline-none focus:border-stone-900"
        placeholder="Whatever comes out. Nobody else reads this."
      />
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.saved ? <p className="text-sm text-stone-600">Saved. You can come back and add to it.</p> : null}
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save reflection'}</Button>
    </form>
  );
}
