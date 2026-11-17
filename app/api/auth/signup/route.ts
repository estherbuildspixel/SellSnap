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
import { getClientIp } from '@/lib/request';
import { enqueueWelcomeEmail } from '@/lib/jobs';
import { sendEmailVerificationCode } from '@/lib/email-verification';

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
  businessName: z.string().min(2, 'Business name must be at least 2 characters').max(100),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(200),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await enforceRateLimit(`api.auth.signup:${ip}`, 5, 60000);
    if (limited) return limited;

    const untrusted = enforceTrustedOrigin(req);
    if (untrusted) return untrusted;

    const body = await req.json().catch(() => null);
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Please check your input and try again.';
      return fail(400, 'invalid_input', message);
    }

    const { name, email, businessName, password } = parsed.data;

    // Enforce the same password policy the browser shows.
    const passwordError = getPasswordError(password);
    if (passwordError) {
      return fail(400, 'weak_password', passwordError);
    }

    // Check if user already exists
    const existing = await db.user.findUnique({
      where: { email },
    });

    if (existing) {
      return fail(409, 'conflict', 'An account with this email already exists.');
    }

    // 4. Hash password
    const passwordHash = await hashPassword(password);

    // 5. Create user
    const newUser = await db.user.create({
      data: {
        name,
        email,
        businessName,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        businessName: true,
        createdAt: true,
      },
    });

    const verification = await sendEmailVerificationCode({
      userId: newUser.id,
      email: newUser.email,
      name: newUser.name,
    });

    if (!verification.sent) {
      logger.warn('auth.signup.verification_email_failed', { userId: newUser.id });
    }

    logger.info('auth.signup.success', {
      userId: newUser.id,
      emailSent: verification.sent,
    });

    const data = {
      ...newUser,
      emailSent: verification.sent,
      ...(verification.devCode ? { devCode: verification.devCode } : {}),
    };

    await enqueueWelcomeEmail({ userId: newUser.id });

    return ok(data, 201);
  } catch (error) {
    logger.error('auth.signup.failed', { error });
    return fail(500, 'server_error', 'Something went wrong while creating your account.');
  }
}
