import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'swr_session';
const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return true;
  }
  if (pathname.startsWith('/invite/')) return true;
  if (pathname.startsWith('/api/')) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname === '/favicon.ico') return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = isPublicPath(pathname);

  if (!hasSession && !isPublic) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('returnTo', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isPublic && pathname !== '/invite') {
    if (
      pathname === '/login' ||
      pathname === '/register' ||
      pathname === '/forgot-password' ||
      pathname === '/reset-password'
    ) {
      return NextResponse.redirect(new URL('/projects', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!.*\\..*).*)'],
};
