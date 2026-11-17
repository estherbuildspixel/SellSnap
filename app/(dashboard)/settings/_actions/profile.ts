'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendEmailVerificationCode } from '@/lib/email-verification';
import type { ActionResult } from '@/lib/types';
import {
  firstIssueMessage,
  profileSchema,
  rateLimitedAction,
} from './helpers';

type UpdatedProfile = {
  id: string;
  name: string;
  businessName: string;
  email: string;
  pendingEmail: string | null;
  emailChanged: boolean;
  emailSent?: boolean;
  devCode?: string;
};

export async function updateProfileAction(
  formData: FormData,
): Promise<ActionResult<UpdatedProfile>> {
  try {
    const session = await getSession();
    if (!session) {
      return {
        ok: false,
        error: { code: 'unauthorized', message: 'Please sign in to update settings.' },
      };
    }

    const parsed = profileSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'invalid_input', message: firstIssueMessage(parsed.error) },
      };
    }

    const { name, businessName, email } = parsed.data;

    const current = await db.user.findUnique({
      where: { id: session.userId },
      select: { email: true },
    });

    if (!current) {
      return {
        ok: false,
        error: { code: 'unauthorized', message: 'Please sign in to update settings.' },
      };
    }

    const emailChanged = email !== current.email;

    if (emailChanged) {
      const existing = await db.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existing && existing.id !== session.userId) {
        return {
          ok: false,
          error: {
            code: 'email_taken',
            message: 'Another account already uses this email address.',
          },
        };
      }

      const limit = await checkRateLimit(
        `action.settings.email_change:${session.userId}`,
        3,
        10 * 60 * 1000
      );
      if (!limit.ok) return rateLimitedAction();
    }

    const updated = await db.user.update({
      where: { id: session.userId },
      data: {
        name,
        businessName,
        ...(emailChanged ? { pendingEmail: email } : {}),
      },
      select: {
        id: true,
        name: true,
        businessName: true,
        email: true,
        pendingEmail: true,
      },
    });

    let emailSent: boolean | undefined;
    let devCode: string | undefined;

    if (emailChanged) {
      const delivered = await sendEmailVerificationCode({
        userId: session.userId,
        email,
        name,
      });
      emailSent = delivered.sent;
      devCode = delivered.devCode;

      if (!delivered.sent) {
        logger.warn('settings.email_change.verification_email_failed', {
          userId: session.userId,
        });
      }
    }

    revalidatePath('/settings');
    revalidatePath('/dashboard');
    logger.info('settings.profile.updated', {
      userId: session.userId,
      emailChanged,
    });

    return {
      ok: true,
      data: {
        ...updated,
        emailChanged,
        ...(emailSent !== undefined ? { emailSent } : {}),
        ...(devCode ? { devCode } : {}),
      },
    };
  } catch (error) {
    logger.error('action.update_profile.failed', { error });
    return {
      ok: false,
      error: { code: 'server_error', message: 'Could not save settings. Please try again.' },
    };
  }
}
