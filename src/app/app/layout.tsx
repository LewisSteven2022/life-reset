import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getQaDayOffset, isQaEnabled } from '@/lib/qa';
import { QaBar } from '@/components/qa-bar';
import { listUnlocks } from '@/lib/data/rewards';
import { appearanceFromUnlocks } from '@/lib/appearance';

const NAV = [
  { href: '/app', label: 'Today' },
  { href: '/app/plan', label: 'Plan' },
  { href: '/app/reflect', label: 'Reflect' },
  { href: '/app/rewards', label: 'Rewards' },
  { href: '/app/account', label: 'Account' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const qaEnabled = isQaEnabled();
  const qaOffset = qaEnabled ? await getQaDayOffset() : 0;
  const appearance = appearanceFromUnlocks(await listUnlocks());

  return (
    <div data-theme={appearance.theme} className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper text-ink">
      {qaEnabled ? <QaBar offset={qaOffset} /> : null}
      <div className="flex-1 px-6 pb-28 pt-10">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md justify-between border-t border-mist bg-paper/95 px-6 py-3 backdrop-blur">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="text-xs text-quiet">
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
