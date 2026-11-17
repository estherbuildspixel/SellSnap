import { Prisma } from '@prisma/client';
import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
} from 'next-auth/adapters';
import { db } from '@/lib/db';

/**
 * Minimal Prisma adapter for NextAuth's database session strategy.
 *
 * We implement it locally rather than pulling in `@next-auth/prisma-adapter`
 * because SellSnap only needs the core session/user methods and keeps its
 * dependency list deliberately small. OAuth account methods are implemented
 * for completeness; no OAuth provider is configured today.
 */

type UserRecord = {
  id: string;
  name: string;
  email: string;
  businessName: string;
  passwordHash: string;
  passwordChangedAt: Date | null;
  onboardedAt: Date | null;
  createdAt: Date;
};

type AdapterUserWithBusiness = AdapterUser & { businessName: string };

function toAdapterUser(user: UserRecord): AdapterUserWithBusiness {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: null,
    image: null,
    businessName: user.businessName,
  };
}

function toAdapterSession(session: {
  sessionToken: string;
  userId: string;
  expires: Date;
}): AdapterSession {
  return {
    sessionToken: session.sessionToken,
    userId: session.userId,
    expires: session.expires,
  };
}

function isRecordNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
  );
}

export function SellSnapPrismaAdapter(): Adapter {
  return {
    async createUser() {
      // Sellers are created by the signup route, which sets passwordHash.
      // Allowing an adapter-created user here would produce a passwordless
      // account, so fail closed.
      throw new Error('Adapter user creation is disabled; use /api/auth/signup.');
    },

    async getUser(id) {
      const user = await db.user.findUnique({ where: { id } });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByEmail(email) {
      const user = await db.user.findUnique({ where: { email } });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const account = await db.account.findUnique({
        where: {
          provider_providerAccountId: { provider, providerAccountId },
        },
        include: { user: true },
      });

      return account ? toAdapterUser(account.user) : null;
    },

    async updateUser(user) {
      const updated = await db.user.update({
        where: { id: user.id },
        data: {
          ...(user.name !== undefined ? { name: user.name ?? '' } : {}),
          ...(user.email !== undefined && user.email !== null
            ? { email: user.email }
            : {}),
        },
      });
      return toAdapterUser(updated);
    },

    async deleteUser(userId) {
      try {
        await db.user.delete({ where: { id: userId } });
      } catch (error) {
        if (!isRecordNotFound(error)) throw error;
      }
      return null;
    },

    async linkAccount(account: AdapterAccount) {
      await db.account.create({
        data: {
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          refresh_token: account.refresh_token ?? null,
          access_token: account.access_token ?? null,
          expires_at: account.expires_at ?? null,
          token_type: account.token_type ?? null,
          scope: account.scope ?? null,
          id_token: account.id_token ?? null,
          session_state:
            typeof account.session_state === 'string'
              ? account.session_state
              : account.session_state
                ? JSON.stringify(account.session_state)
                : null,
        },
      });
      return account;
    },

    async unlinkAccount({
      provider,
      providerAccountId,
    }: {
      provider: string;
      providerAccountId: string;
    }) {
      try {
        await db.account.delete({
          where: {
            provider_providerAccountId: { provider, providerAccountId },
          },
        });
      } catch (error) {
        if (!isRecordNotFound(error)) throw error;
      }
      return undefined;
    },

    async createSession(session) {
      const created = await db.session.create({
        data: {
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires,
        },
      });
      return toAdapterSession(created);
    },

    async getSessionAndUser(sessionToken) {
      const session = await db.session.findUnique({
        where: { sessionToken },
        include: { user: true },
      });

      if (!session) return null;

      return {
        session: toAdapterSession(session),
        user: toAdapterUser(session.user),
      };
    },

    async updateSession(session) {
      try {
        const updated = await db.session.update({
          where: { sessionToken: session.sessionToken },
          data: { expires: session.expires },
        });
        return toAdapterSession(updated);
      } catch (error) {
        if (isRecordNotFound(error)) return null;
        throw error;
      }
    },

    async deleteSession(sessionToken) {
      try {
        const deleted = await db.session.delete({ where: { sessionToken } });
        return toAdapterSession(deleted);
      } catch (error) {
        if (isRecordNotFound(error)) return null;
        throw error;
      }
    },
  };
}
