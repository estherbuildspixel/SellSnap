'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  sendEmailVerificationCode,
  verifyEmailCode,
} from '@/lib/email-verification';
import type { ActionResult } from '@/lib/types';
import {
  codeSchema,
  firstIssueMessage,
  rateLimitedAction,
} from './helpers';

export async function verifyEmailChangeAction(
  formData: FormData,
): Promise<ActionResult<{ email: string }>> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: { code: 'unauthorized', message: 'Please sign in.' } };
    }

    const limit = await checkRateLimit(
      `action.settings.verify_email_change:${session.userId}`,
      10,
      15 * 60 * 1000
    );
    if (!limit.ok) return rateLimitedAction();

    const parsed = codeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'invalid_input',
          message: firstIssueMessage(parsed.error, 'Enter the 6-digit code.'),
        },
      };
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { pendingEmail: true },
    });

    if (!user?.pendingEmail) {
      return {
        ok: false,
        error: {
          code: 'no_pending_email',
          message: 'There is no pending email change to verify.',
        },
      };
    }

    const result = await verifyEmailCode({
      userId: session.userId,
      email: user.pendingEmail,
      code: parsed.data.code,
      applyEmailChange: true,
    });

    if (!result.ok) {
      if (result.reason === 'too_many_attempts') {
        return {
          ok: false,
          error: {
            code: 'too_many_attempts',
            message: 'Too many incorrect attempts. Request a new code.',
          },
        };
      }

      return {
        ok: false,
        error: { code: 'invalid_code', message: 'That code is incorrect or has expired.' },
      };
    }

    const email = user.pendingEmail;

    revalidatePath('/settings');
    revalidatePath('/dashboard');
    logger.info('settings.email_change.verified', { userId: session.userId });

    return { ok: true, data: { email } };
  } catch (error) {
    logger.error('action.verify_email_change.failed', { error });
    return {
      ok: false,
      error: {
        code: 'server_error',
        message: 'Could not verify your email. Please try again.',
      },
    };
  }
}

export async function resendEmailChangeCodeAction(): Promise<
  ActionResult<{ sent: boolean; devCode?: string }>
> {
  try {
    const session = await getSession();
    if (!session) {
      return { ok: false, error: { code: 'unauthorized', message: 'Please sign in.' } };
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { name: true, pendingEmail: true },
    });

    if (!user?.pendingEmail) {
      return {
        ok: false,
        error: { code: 'no_pending_email', message: 'There is no pending email change.' },
      };
    }

    const limit = await checkRateLimit(
      `action.settings.resend_email_change:${session.userId}`,
      3,
      10 * 60 * 1000
    );
    if (!limit.ok) return rateLimitedAction();

    const delivered = await sendEmailVerificationCode({
      userId: session.userId,
      email: user.pendingEmail,
      name: user.name,
    });

    logger.info('settings.email_change.resent', {
      userId: session.userId,
      sent: delivered.sent,
    });

    return {
      ok: true,
      data: {
        sent: delivered.sent,
        ...(delivered.devCode ? { devCode: delivered.devCode } : {}),
      },
    };
  } catch (error) {
    logger.error('action.resend_email_change.failed', { error });
    return {
      ok: false,
      error: {
        code: 'server_error',
        message: 'Could not send a new code. Please try again.',
      },
    };
  }
}
