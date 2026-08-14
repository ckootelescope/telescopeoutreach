import { authClient, isAllowed } from '@/lib/supabase';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/analytics';

  if (!code) return NextResponse.redirect(`${origin}/login?error=send_failed`);

  const supabase = await authClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) return NextResponse.redirect(`${origin}/login?error=send_failed`);
  // Belt and braces: the allowlist is enforced at send time and in middleware,
  // but a session must never survive here for an address that is not on it.
  if (!isAllowed(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
