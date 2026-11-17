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
import { sendEmailVerificationCode } from '@/lib/email-verification';
import { getClientIp } from '@/lib/request';

const resendSchema = z.object({
  email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ipLimited = await enforceRateLimit(
      `api.auth.resend_verification:ip:${ip}`,
      5,
      10 * 60 * 1000,
      'Too many requests. Please try again shortly.'
    );
    if (ipLimited) return ipLimited;

    const untrusted = enforceTrustedOrigin(req);
    if (untrusted) return untrusted;

    const body = await req.json().catch(() => null);
    const parsed = resendSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, 'invalid_input', 'Please enter a valid email address.');
    }

    const { email } = parsed.data;

    const emailLimited = await enforceRateLimit(
      `api.auth.resend_verification:email:${email}`,
      3,
      10 * 60 * 1000,
      'Too many requests. Please try again shortly.'
    );
    if (emailLimited) return emailLimited;

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, pendingEmail: true, emailVerified: true },
    });

    if (!user || (user.emailVerified && !user.pendingEmail)) {
      return ok({ sent: true });
    }

    const targetEmail = user.pendingEmail ?? user.email;
    const result = await sendEmailVerificationCode({
      userId: user.id,
      email: targetEmail,
      name: user.name,
    });

    logger.info('auth.verification_resent', {
      userId: user.id,
      sent: result.sent,
      pendingEmail: Boolean(user.pendingEmail),
    });

    return ok({ sent: result.sent, devCode: result.devCode });
  } catch (error) {
    logger.error('auth.resend_verification.failed', { error });
    return fail(500, 'server_error', 'Something went wrong while sending a new code.');
  }
}
