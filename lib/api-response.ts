import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { isTrustedOrigin } from '@/lib/request';
import type { ApiResponseFailure, ApiResponseSuccess } from '@/lib/types';

export function fail(status: number, code: string, message: string) {
  return NextResponse.json<ApiResponseFailure>(
    { ok: false, error: { code, message } },
    { status }
  );
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiResponseSuccess<T>>({ ok: true, data }, { status });
}

export function rateLimited(
  retryAfterSec = 30,
  message = 'Too many attempts. Please try again shortly.'
) {
  return NextResponse.json<ApiResponseFailure>(
    { ok: false, error: { code: 'rate_limited', message } },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  );
}

export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  message?: string
) {
  const result = await checkRateLimit(key, limit, windowMs);
  if (result.ok) return null;

  return rateLimited(result.retryAfterSec ?? 30, message);
}

export function enforceTrustedOrigin(req: NextRequest) {
  if (isTrustedOrigin(req)) return null;

  return fail(403, 'forbidden', 'This request did not come from SellSnap.');
}
