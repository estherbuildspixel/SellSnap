import bcrypt from 'bcryptjs';

/**
 * Server-only password hashing. Kept separate from `lib/password.ts` so the
 * policy rules stay importable from client components without bundling bcrypt.
 */

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function needsPasswordRehash(passwordHash: string): boolean {
  try {
    return bcrypt.getRounds(passwordHash) < BCRYPT_ROUNDS;
  } catch {
    return false;
  }
}
