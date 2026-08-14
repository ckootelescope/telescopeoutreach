import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Gate every page behind a session and an allowlist. This runs before any
// route renders, so an unauthenticated request never reaches a query.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const ok = !!user?.email && allowed.includes(user.email.toLowerCase());

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith('/login') || path.startsWith('/auth');

  if (!ok && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    // A signed-in address that is not on the list is a different failure from
    // being signed out, and the login page says so rather than looping.
    if (user?.email) url.searchParams.set('denied', user.email);
    return NextResponse.redirect(url);
  }
  if (ok && isAuthRoute && !path.startsWith('/auth')) {
    const url = request.nextUrl.clone();
    url.pathname = '/analytics';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
