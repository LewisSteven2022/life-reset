import Link from 'next/link';
import { coachLineForSetup } from '@/content/coach';

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-6 py-16">
      <div className="space-y-8">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.22em] text-quiet">21 days</p>
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: 21 }, (_, day) => (
              <span key={day} className="h-3 flex-1 rounded-full bg-mark/40" />
            ))}
          </div>
        </div>
        <h1 className="font-display text-4xl font-semibold leading-[1.15] text-ink">
          Reset the parts of your life that have drifted.
        </h1>
        <p className="text-lg leading-relaxed text-quiet">{coachLineForSetup()}</p>
      </div>
      <div className="space-y-4">
        <Link
          href="/signup"
          className="block rounded-full bg-ink px-6 py-4 text-center text-base font-medium text-paper"
        >
          Start your reset
        </Link>
        <p className="text-center text-sm text-quiet">
          Already started? <Link href="/login" className="underline decoration-mark underline-offset-4">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
