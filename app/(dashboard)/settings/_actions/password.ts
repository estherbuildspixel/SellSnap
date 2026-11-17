'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getPasswordError } from '@/lib/password';
import { hashPassword, verifyPassword } from '@/lib/password-hash';
import type { ActionResult } from '@/lib/types';
import {
  firstIssueMessage,
  passwordSchema,
  rateLimitedAction,
} from './helpers';

export async function changePasswordAction(
  formData: FormData,
): Promise<ActionResult<{ sessionsInvalidated: true }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: { code: 'unauthorized', message: 'Please sign in.' } };
    }

    const limit = await checkRateLimit(
      `action.settings.change_password:${session.userId}`,
      5,
      15 * 60 * 1000
    );
    if (!limit.ok) return rateLimitedAction();

    const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'invalid_input',
          message: firstIssueMessage(parsed.error),
        },
      };
    }

    const { currentPassword, newPassword, confirmPassword } = parsed.data;

    if (newPassword !== confirmPassword) {
      return {
        ok: false,
        error: {
          code: 'password_mismatch',
          message: 'The new passwords do not match.',
        },
      };
    }

    if (newPassword === currentPassword) {
      return {
        ok: false,
        error: {
          code: 'password_reused',
          message: 'Choose a password different from your current one.',
        },
      };
    }

    const passwordError = getPasswordError(newPassword);
    if (passwordError) {
      return { ok: false, error: { code: 'weak_password', message: passwordError } };
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true },
    });

    if (!user) {
      return { ok: false, error: { code: 'unauthorized', message: 'Please sign in.' } };
    }

    const currentIsValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentIsValid) {
      return {
        ok: false,
        error: {
          code: 'invalid_password',
          message: 'Your current password is incorrect.',
        },
      };
    }

    const passwordHash = await hashPassword(newPassword);
    const sessionToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

    const currentSession = sessionToken
      ? await db.session.findUnique({
          where: { sessionToken },
          select: { userId: true, createdAt: true },
        })
      : null;

    const keepCurrentSession = currentSession?.userId === session.userId;
    const passwordChangedAt =
      keepCurrentSession && currentSession ? currentSession.createdAt : new Date();

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.userId },
        data: { passwordHash, passwordChangedAt },
      });

      await tx.session.deleteMany({
        where: {
          userId: session.userId,
          ...(keepCurrentSession && sessionToken
            ? { sessionToken: { not: sessionToken } }
            : {}),
        },
      });

      await tx.passwordResetToken.deleteMany({
        where: { userId: session.userId },
      });
    });

    revalidatePath('/settings');
    logger.info('settings.password.changed', { userId: session.userId });

    return { ok: true, data: { sessionsInvalidated: true } };
  } catch (error) {
    logger.error('action.change_password.failed', { error });
    return {
      ok: false,
      error: {
        code: 'server_error',
        message: 'Could not change your password. Please try again.',
      },
    };
  }
}
