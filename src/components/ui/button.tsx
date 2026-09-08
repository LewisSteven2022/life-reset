import type { ComponentProps } from 'react';

export function Button({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={`w-full rounded-full bg-stone-900 px-6 py-4 text-base font-medium text-stone-50 disabled:opacity-50 ${className}`}
    />
  );
}
