import type { ComponentProps } from 'react';

export function Field({ label, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-quiet">{label}</span>
      <input
        {...props}
        className="w-full rounded-2xl border border-mist bg-paper px-4 py-3 text-base outline-none focus:border-ink"
      />
    </label>
  );
}
