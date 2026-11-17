import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  enforceRateLimit,
  enforceTrustedOrigin,
  fail,
  ok,
} from '@/lib/api-response';
import { db } from '@/lib/db';
import { isProduction } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/request';
import {
  hashPassword,
  needsPasswordRehash,
  verifyPassword,
} from '@/lib/password-hash';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required').max(200),
});

const INVALID_CREDENTIALS = 'Invalid email or password. Please try again.';

/**
 * Credentials sign-in with a real database session.
 *
 * NextAuth's built-in Credentials provider always issues a JWT, even when the
 * configured strategy is "database". This route performs the same credential
 * check and then creates a Session row, so logout can revoke the session on the
 * server by deleting that row.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ipLimited = await enforceRateLimit(`api.auth.login:ip:${ip}`, 10, 60 * 1000);
    if (ipLimited) return ipLimited;

    const untrusted = enforceTrustedOrigin(req);
    if (untrusted) return untrusted;

    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, 'invalid_input', INVALID_CREDENTIALS);
    }

    const { email, password } = parsed.data;

    const emailLimited = await enforceRateLimit(
      `api.auth.login:email:${email}`,
      5,
      15 * 60 * 1000
    );
    if (emailLimited) return emailLimited;

    // 5. Authenticate.
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, emailVerified: true },
    });

    if (!user || !user.passwordHash) {
      logger.info('auth.login.invalid_credentials', {});
      return fail(401, 'invalid_credentials', INVALID_CREDENTIALS);
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      logger.info('auth.login.invalid_credentials', { userId: user.id });
      return fail(401, 'invalid_credentials', INVALID_CREDENTIALS);
    }

    if (!user.emailVerified) {
      logger.info('auth.login.email_unverified', { userId: user.id });
      return fail(403, 'email_unverified', 'Please verify your email before signing in.');
    }

    // Transparent upgrade: a hash made with a weaker work factor is re-hashed
    // at the current cost on successful login. A failed upgrade must not
    // block sign-in; the next login retries it.
    if (needsPasswordRehash(user.passwordHash)) {
      try {
        const upgradedHash = await hashPassword(password);
        await db.user.update({
          where: { id: user.id },
          data: { passwordHash: upgradedHash },
        });
        logger.info('auth.login.password_rehashed', { userId: user.id });
      } catch (error) {
        logger.error('auth.login.rehash_failed', { userId: user.id, error });
      }
    }

    // 6. Create the database session. The token is 32 bytes of cryptographic
    //    entropy, matching the strength NextAuth uses for database sessions.
    const sessionToken = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

    await db.session.deleteMany({
      where: { userId: user.id, expires: { lt: new Date() } },
    });

    await db.session.create({
      data: { sessionToken, userId: user.id, expires },
    });

    const response = ok({ redirectTo: '/dashboard' });

    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isProduction,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    logger.info('auth.login.success', { userId: user.id });
    return response;
  } catch (error) {
    logger.error('auth.login.failed', { error });
    return fail(500, 'server_error', 'Something went wrong while signing you in.');
  }
}
