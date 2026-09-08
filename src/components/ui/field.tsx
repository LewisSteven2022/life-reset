import type { ComponentProps } from 'react';

export function Field({ label, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-stone-600">{label}</span>
      <input
        {...props}
        className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-stone-900"
      />
    </label>
  );
}
