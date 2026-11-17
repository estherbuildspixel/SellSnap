import { cookies } from 'next/headers';
import { getServerSession, type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import { env, isProduction } from '@/lib/env';
import { SellSnapPrismaAdapter } from '@/lib/auth-adapter';
import { logger } from '@/lib/logger';

export type AppSession = {
  user: {
    id: string;
    email: string;
    name: string;
    businessName: string;
  };
  userId: string;
};

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * NextAuth's database strategy stores the raw session token in this cookie.
 * The custom credentials login route and getSession() must use the same name.
 */
export const SESSION_COOKIE_NAME = isProduction
  ? '__Secure-next-auth.session-token'
  : 'next-auth.session-token';

export const authOptions: NextAuthOptions = {
  adapter: SellSnapPrismaAdapter(),
  session: {
    strategy: 'database',
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: 24 * 60 * 60, // refresh the session expiry once per day
  },
  pages: {
    signIn: '/auth',
    error: '/auth',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize() {
        // NextAuth's built-in credentials flow always mints a JWT, even when
        // the configured strategy is "database". SellSnap signs credentials
        // users in through /api/auth/login, which creates a real Session row.
        // Returning null here disables the inconsistent built-in path.
        return null;
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user && user) {
        (session.user as { id?: string }).id = user.id;
        (session.user as { businessName?: string }).businessName =
          (user as { businessName?: string }).businessName ?? '';
      }
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isProduction,
        maxAge: SESSION_MAX_AGE_SECONDS,
      },
    },
  },
  secret: env.NEXTAUTH_SECRET,
};

/**
 * Server-side helper to get authenticated user session.
 * Returns null if unauthenticated, if the session row was deleted, or if the
 * session predates the last password change.
 */
export async function getSession(): Promise<AppSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !(session.user as { id?: string }).id) {
    return null;
  }

  const userId = (session.user as { id: string }).id;
  const businessName = (session.user as { businessName?: string }).businessName || '';

  const sessionToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) {
    return null;
  }

  const dbSession = await db.session.findUnique({
    where: { sessionToken },
    select: { createdAt: true, expires: true },
  });

  if (!dbSession || dbSession.expires.getTime() <= Date.now()) {
    return null;
  }

  // Defense in depth: the reset-password flow deletes sessions server-side, but
  // also reject any session minted before the most recent password change.
  const account = await db.user.findUnique({
    where: { id: userId },
    select: { passwordChangedAt: true },
  });

  if (account?.passwordChangedAt && dbSession.createdAt < account.passwordChangedAt) {
    await db.session.delete({ where: { sessionToken } }).catch(() => undefined);
    logger.info('auth.session.invalidated', { userId });
    return null;
  }

  return {
    user: {
      id: userId,
      email: session.user.email,
      name: session.user.name || '',
      businessName,
    },
    userId,
  };
}
