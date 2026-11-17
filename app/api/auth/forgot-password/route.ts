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
import { issueResetToken, sendResetEmail } from '@/lib/password-reset';
import { getClientIp } from '@/lib/request';

const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

/**
 * The response is identical whether or not the email belongs to an account.
 * Any difference would let a stranger enumerate which sellers have accounts.
 */
const GENERIC_MESSAGE =
  'If an account exists for that email, we have sent a password reset link.';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ipLimited = await enforceRateLimit(
      `api.auth.forgot_password:ip:${ip}`,
      5,
      15 * 60 * 1000,
      'Too many requests. Please try again shortly.'
    );
    if (ipLimited) return ipLimited;

    const untrusted = enforceTrustedOrigin(req);
    if (untrusted) return untrusted;

    const body = await req.json().catch(() => null);
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, 'invalid_input', 'Please enter a valid email address.');
    }
    const { email } = parsed.data;

    const emailLimited = await enforceRateLimit(
      `api.auth.forgot_password:email:${email}`,
      3,
      60 * 60 * 1000,
      'Too many requests. Please try again shortly.'
    );
    if (emailLimited) return emailLimited;

    // 5. Do the work.
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      logger.info('auth.forgot_password.no_account', {});
    } else {
      const { token } = await issueResetToken(user.id);
      await sendResetEmail({ to: user.email, name: user.name, token });
      logger.info('auth.forgot_password.sent', { userId: user.id });
    }

    return ok({ message: GENERIC_MESSAGE });
  } catch (error) {
    logger.error('auth.forgot_password.failed', { error });
    return fail(500, 'server_error', 'Something went wrong. Please try again.');
  }
}
