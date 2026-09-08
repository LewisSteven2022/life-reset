import { NextResponse, type NextRequest } from 'next/server';
import { isQaEnabled, QA_COOKIE } from '@/lib/qa';

export async function POST(request: NextRequest) {
  // Hard stop. In production this env var is never set, so the endpoint does
  // not exist as far as any caller is concerned.
  if (!isQaEnabled()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { offset?: unknown };
  const offset = Math.min(30, Math.max(0, Number(body.offset) || 0));

  const response = NextResponse.json({ offset });
  response.cookies.set(QA_COOKIE, String(offset), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  return response;
}
