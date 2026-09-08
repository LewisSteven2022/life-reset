'use client';

export function QaBar({ offset }: { offset: number }) {
  async function jump(next: number) {
    await fetch('/api/qa/fast-forward', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offset: next }),
    });
    window.location.reload();
  }

  return (
    <div data-qa-bar className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-xs text-amber-900">
      <span>QA: +{offset} days</span>
      <button type="button" onClick={() => jump(offset + 1)} className="underline">+1</button>
      <button type="button" onClick={() => jump(offset + 6)} className="underline">+6</button>
      <button type="button" onClick={() => jump(0)} className="underline">reset</button>
    </div>
  );
}
