import { createHash, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { appUrl } from '@/lib/env';
import { sendEmail } from '@/lib/email';

const TOKEN_ENTROPY_BYTES = 32;
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Mints a reset token. The raw value goes to the user; only its hash is
 * stored, so a database leak does not hand out working reset links.
 */
export function generateResetToken(): string {
  return randomBytes(TOKEN_ENTROPY_BYTES).toString('hex');
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function buildResetUrl(token: string): string {
  return `${appUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Issues a reset token for a user. Any outstanding token is dropped first so
 * only the newest link ever works.
 */
export async function issueResetToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
  await db.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  return { token, expiresAt };
}

/**
 * Loads a token that is still usable. Returns null when the token is unknown,
 * already spent, or expired.
 */
export async function findValidResetToken(token: string) {
  const tokenHash = hashResetToken(token);

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;

  return record;
}

export async function sendResetEmail({
  to,
  name,
  token,
}: {
  to: string;
  name: string;
  token: string;
}): Promise<boolean> {
  const resetUrl = buildResetUrl(token);

  const result = await sendEmail({
    to,
    subject: 'Reset your SellSnap password',
    text: [
      `Hi ${name},`,
      '',
      'We received a request to reset the password on your SellSnap account.',
      '',
      `Choose a new password: ${resetUrl}`,
      '',
      'This link expires in 1 hour and can only be used once.',
      'If you did not request this, ignore this email — your password has not changed.',
      '',
      '— SellSnap',
    ].join('\n'),
    devPreview: resetUrl,
  });

  return result.sent;
}
