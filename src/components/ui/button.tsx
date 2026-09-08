import type { ComponentProps } from 'react';

export function Button({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={`w-full rounded-full bg-ink px-6 py-4 text-base font-medium text-paper disabled:opacity-50 ${className}`}
    />
  );
}
