import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

// Very basic in-memory rate limiting map for MVP.
// For production scale, replace with Redis (upstash/ratelimit)
const rateLimitMap = new Map<string, { count: number, resetAt: number }>();

function applyRateLimit(ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true; // Allowed
  }

  if (record.count >= maxRequests) {
    return false; // Rate limited
  }

  record.count++;
  return true; // Allowed
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  // req.auth can be an Auth.js error object (e.g. UntrustedHost) instead of a
  // session or undefined - only a real session has .user, never treat an
  // error as "authenticated".
  const isAuth = !!req.auth && !('message' in req.auth) && !!req.auth.user;
  const role = (req.auth?.user as any)?.role;
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown-ip';
  const isAuthPage = pathname.startsWith('/auth');
  const isApi = pathname.startsWith('/api');

  // 1. Rate Limiting on critical endpoints (e.g., Auth, Application actions)
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/api/applications/')) {
    // Max 20 requests per minute per IP
    if (!applyRateLimit(ip, 20, 60 * 1000)) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }
  }

  // 2. Admin Route Protection at the Edge - gated by its own login, not the user one.
  const isAdminRoute = pathname.startsWith('/b2b-hq') || pathname.startsWith('/api/admin');
  const isAdminLoginPage = pathname === '/admin/login';

  if (isAdminRoute) {
    if (!isAuth) {
      return NextResponse.redirect(new URL('/admin/login', req.url));
    }
    if (role !== 'admin') {
      return NextResponse.redirect(new URL('/applications', req.url)); // Unauthorized users go to home
    }
  }
  if (isAdminLoginPage && isAuth && role === 'admin') {
    return NextResponse.redirect(new URL('/b2b-hq', req.url));
  }

  const isPublicRoute = pathname === '/' || pathname === '/favicon.ico' || pathname.startsWith('/_next') || pathname.startsWith('/public') || isAdminLoginPage;

  if (isApi) return NextResponse.next();
  if (pathname === '/home') return NextResponse.redirect(new URL('/applications', req.url));
  if (isAuthPage && isAuth) return NextResponse.redirect(new URL('/applications', req.url));

  // If not authenticated, not on auth page, and not on a public route, redirect to login
  if (!isAuth && !isAuthPage && !isPublicRoute) {
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
