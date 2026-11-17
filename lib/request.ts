import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

/**
 * Shared request helpers for route handlers.
 */

/**
 * Best-effort client IP. Falls back to "unknown" rather than trusting a
 * header the client can freely set for identity purposes — it is only used to
 * bucket rate limits.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * The origins this app is served from. Used for CSRF origin checks.
 */
export function getAppOrigins(): string[] {
  const origins = new Set<string>();

  for (const value of [env.NEXT_PUBLIC_APP_URL, env.NEXTAUTH_URL]) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore malformed configuration rather than failing the request.
    }
  }

  if (origins.size === 0) {
    origins.add('http://localhost:3000');
  }

  return [...origins];
}

/**
 * Verifies that a state-changing request came from this app.
 *
 * Browsers always send an Origin header on cross-origin POSTs, so rejecting a
 * mismatched Origin blocks CSRF. A missing Origin means a non-browser client
 * (curl, a server-to-server call) with no ambient cookies to abuse, so it is
 * allowed through.
 */
export function isTrustedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  return getAppOrigins().includes(origin);
}
