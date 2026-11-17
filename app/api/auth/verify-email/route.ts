import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  enforceRateLimit,
  enforceTrustedOrigin,
  fail,
  ok,
} from '@/lib/api-response';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyEmailCode } from '@/lib/email-verification';
import { getClientIp } from '@/lib/request';

const verifySchema = z.object({
  email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

const INVALID_CODE = 'That code is incorrect or has expired.';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ipLimited = await enforceRateLimit(
      `api.auth.verify_email:ip:${ip}`,
      10,
      60 * 1000
    );
    if (ipLimited) return ipLimited;

    const untrusted = enforceTrustedOrigin(req);
    if (untrusted) return untrusted;

    const body = await req.json().catch(() => null);
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || INVALID_CODE;
      return fail(400, 'invalid_input', message);
    }

    const { email, code } = parsed.data;

    const emailLimited = await enforceRateLimit(
      `api.auth.verify_email:email:${email}`,
      10,
      15 * 60 * 1000
    );
    if (emailLimited) return emailLimited;

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, pendingEmail: true, emailVerified: true },
    });

    if (!user) {
      return fail(400, 'invalid_code', INVALID_CODE);
    }

    if (user.emailVerified && !user.pendingEmail) {
      return ok({ verified: true, email: user.email });
    }

    const applyEmailChange = user.pendingEmail === email;
    const result = await verifyEmailCode({
      userId: user.id,
      email,
      code,
      applyEmailChange,
    });

    if (!result.ok) {
      if (result.reason === 'too_many_attempts') {
        return fail(
          429,
          'too_many_attempts',
          'Too many incorrect attempts. Request a new code.'
        );
      }

      return fail(400, 'invalid_code', INVALID_CODE);
    }

    logger.info('auth.email_verified', { userId: user.id, emailChanged: applyEmailChange });

    return ok({ verified: true, email });
  } catch (error) {
    logger.error('auth.verify_email.failed', { error });
    return fail(500, 'server_error', 'Something went wrong while verifying your email.');
  }
}
