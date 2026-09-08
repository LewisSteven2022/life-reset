import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  const dest = new URL('/', request.nextUrl.origin);
  return NextResponse.redirect(dest, { status: 303 });
}
