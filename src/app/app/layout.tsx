import Link from 'next/link';
import { requireUser } from '@/lib/auth';

const NAV = [
  { href: '/app', label: 'Today' },
  { href: '/app/plan', label: 'Plan' },
  { href: '/app/reflect', label: 'Reflect' },
  { href: '/app/rewards', label: 'Rewards' },
  { href: '/app/account', label: 'Account' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="flex-1 px-6 pb-28 pt-10">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md justify-between border-t border-stone-200 bg-stone-50/95 px-6 py-3 backdrop-blur">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="text-xs text-stone-600">
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
