import { createHash, randomInt } from 'node:crypto';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { isProduction } from '@/lib/env';

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export type EmailCodeFailure = 'invalid' | 'too_many_attempts';

export type VerifyEmailCodeResult =
  | { ok: true }
  | { ok: false; reason: EmailCodeFailure };

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const generateCode = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

const hashCode = (code: string, email: string) =>
  createHash('sha256').update(`${code}:${normalizeEmail(email)}`).digest('hex');

export async function sendEmailVerificationCode({
  userId,
  email,
  name,
}: {
  userId: string;
  email: string;
  name: string;
}): Promise<{ sent: boolean; devCode?: string }> {
  const normalizedEmail = normalizeEmail(email);
  const code = generateCode();

  await db.emailVerificationCode.deleteMany({
    where: { userId, email: normalizedEmail, usedAt: null },
  });

  await db.emailVerificationCode.create({
    data: {
      userId,
      email: normalizedEmail,
      codeHash: hashCode(code, normalizedEmail),
      expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
    },
  });

  const result = await sendEmail({
    to: normalizedEmail,
    subject: 'Your SellSnap verification code',
    text: [
      `Hi ${name},`,
      '',
      `Your SellSnap verification code is ${code}.`,
      '',
      'This code expires in 10 minutes. If you did not request it, you can ignore this email.',
      '',
      '- SellSnap',
    ].join('\n'),
    devPreview: code,
  });

  return {
    sent: result.sent,
    devCode: !isProduction && !result.sent ? code : undefined,
  };
}

export async function verifyEmailCode({
  userId,
  email,
  code,
  applyEmailChange = false,
}: {
  userId: string;
  email: string;
  code: string;
  applyEmailChange?: boolean;
}): Promise<VerifyEmailCodeResult> {
  const normalizedEmail = normalizeEmail(email);

  const record = await db.emailVerificationCode.findFirst({
    where: {
      userId,
      email: normalizedEmail,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, codeHash: true, attempts: true },
  });

  if (!record || record.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    return { ok: false, reason: 'invalid' };
  }

  if (record.codeHash !== hashCode(code, normalizedEmail)) {
    const nextAttempts = record.attempts + 1;
    await db.emailVerificationCode.update({
      where: { id: record.id },
      data: { attempts: nextAttempts },
    });

    return {
      ok: false,
      reason: nextAttempts >= EMAIL_CODE_MAX_ATTEMPTS ? 'too_many_attempts' : 'invalid',
    };
  }

  const verifiedAt = new Date();

  await db.$transaction(async (tx) => {
    await tx.emailVerificationCode.update({
      where: { id: record.id },
      data: { usedAt: verifiedAt },
    });

    await tx.emailVerificationCode.deleteMany({
      where: { userId, email: normalizedEmail, usedAt: null },
    });

    await tx.user.update({
      where: { id: userId },
      data: applyEmailChange
        ? { email: normalizedEmail, pendingEmail: null, emailVerified: verifiedAt }
        : { emailVerified: verifiedAt },
    });
  });

  return { ok: true };
}
