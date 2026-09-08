import { cookies } from 'next/headers';

export const QA_COOKIE = 'lr_qa_day_offset';

/**
 * Pure guard so the production lockout is unit-testable. The QA helper is only
 * ever reachable when LIFE_RESET_QA_MODE is exactly "1" AND we are not running
 * a production build. LIFE_RESET_QA_MODE is never set on Vercel production.
 */
export function isQaModeAllowed({ qaMode, nodeEnv }: { qaMode?: string; nodeEnv?: string }): boolean {
  if (nodeEnv === 'production') return false;
  return qaMode === '1';
}

export function isQaEnabled(): boolean {
  return isQaModeAllowed({
    qaMode: process.env.LIFE_RESET_QA_MODE,
    nodeEnv: process.env.NODE_ENV,
  });
}

export async function getQaDayOffset(): Promise<number> {
  if (!isQaEnabled()) return 0;
  const raw = (await cookies()).get(QA_COOKIE)?.value;
  const parsed = Number.parseInt(raw ?? '0', 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(30, Math.max(0, parsed));
}
