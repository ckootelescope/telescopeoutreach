import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, valid } from '@/lib/session';

// Gate every page on a signed session cookie. /login and /api/health stay open:
// health has to be reachable before you can sign in, or diagnosing a bad
// configuration would require the very session the configuration prevents.
const OPEN = ['/login', '/api/health'];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const ok = await valid(request.cookies.get(COOKIE)?.value, process.env.CONSOLE_PASSWORD);

  if (OPEN.some((p) => path.startsWith(p))) {
    if (ok && path.startsWith('/login')) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!ok) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = path === '/' ? '' : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // icon.svg is the app/ file-convention favicon. It has to sit alongside
  // favicon.ico here or the gate redirects it to /login, which is exactly the
  // page where a missing tab icon shows.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
