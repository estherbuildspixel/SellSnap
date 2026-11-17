import { fail, ok } from '@/lib/api-response';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth';

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return fail(401, 'unauthorized', 'Please sign in.');
    }

    await db.user.update({
      where: { id: session.userId },
      data: { onboardedAt: new Date() },
    });

    logger.info('onboarding.completed', { userId: session.userId });

    return ok({ ok: true });
  } catch (error) {
    logger.error('onboarding.complete.failed', { error });
    return fail(500, 'server_error', 'Something went wrong.');
  }
}
