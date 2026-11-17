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
import { getPasswordError, MIN_PASSWORD_LENGTH } from '@/lib/password';
import { hashPassword } from '@/lib/password-hash';
import { findValidResetToken } from '@/lib/password-reset';
import { getClientIp } from '@/lib/request';

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

const INVALID_TOKEN_MESSAGE = 'This reset link is invalid or has expired. Request a new one.';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ipLimited = await enforceRateLimit(
      `api.auth.reset_password:ip:${ip}`,
      10,
      15 * 60 * 1000
    );
    if (ipLimited) return ipLimited;

    const untrusted = enforceTrustedOrigin(req);
    if (untrusted) return untrusted;

    const body = await req.json().catch(() => null);
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, 'invalid_input', 'Please check your input and try again.');
    }
    const { token, password } = parsed.data;

    // 4. Enforce the password policy server-side, not just in the browser.
    const passwordError = getPasswordError(password);
    if (passwordError) {
      return fail(400, 'weak_password', passwordError);
    }

    // 5. Authorize: the token is the credential. It must exist, be unused,
    //    and not have expired.
    const record = await findValidResetToken(token);
    if (!record) {
      logger.info('auth.reset_password.invalid_token', {});
      return fail(400, 'invalid_token', INVALID_TOKEN_MESSAGE);
    }

    // 6. Do the work. The password change and the token spend happen together,
    //    so a link cannot be used twice even if two requests arrive at once.
    const passwordHash = await hashPassword(password);
    const passwordChangedAt = new Date();

    const updated = await db.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        return false;
      }

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, passwordChangedAt },
      });

      // Drop every outstanding token and any stored session for this account.
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } });
      await tx.session.deleteMany({ where: { userId: record.userId } });

      return true;
    });

    if (!updated) {
      logger.info('auth.reset_password.token_race', { userId: record.userId });
      return fail(400, 'invalid_token', INVALID_TOKEN_MESSAGE);
    }

    logger.info('auth.reset_password.success', { userId: record.userId });

    return ok({
      message: 'Your password has been updated. Sign in with your new password.',
    });
  } catch (error) {
    logger.error('auth.reset_password.failed', { error });
    return fail(500, 'server_error', 'Something went wrong. Please try again.');
  }
}
