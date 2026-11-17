import { z } from 'zod';
import { logger } from '@/lib/logger';

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required'),
  NEXTAUTH_URL: optionalUrl,
  FLW_PUBLIC_KEY: z.string().min(1, 'FLW_PUBLIC_KEY is required'),
  FLW_SECRET_KEY: z.string().min(1, 'FLW_SECRET_KEY is required'),
  FLW_SECRET_HASH: z.string().min(1, 'FLW_SECRET_HASH is required'),
  RESEND_API_KEY: z.string().optional().default('resend_mock_key'),
  EMAIL_FROM: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalString,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  NEXT_PUBLIC_APP_URL: optionalUrl,
  CRON_SECRET: optionalString,
  ENABLE_DEV_VERIFY: z.preprocess(
    emptyToUndefined,
    z.enum(['true', 'false']).optional()
  ),
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
});

function parseEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const missing = Object.keys(formatted).filter((k) => k !== '_errors');

    if (isProduction) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    logger.warn('env.validation.incomplete', {
      missing,
      hint: 'Copy .env.example to .env.local and fill in the required values.',
    });
  }

  const parsed = result.success
    ? result.data
    : (process.env as unknown as z.infer<typeof envSchema>);

  if (isProduction) {
    if (!parsed.NEXTAUTH_URL && !parsed.NEXT_PUBLIC_APP_URL) {
      throw new Error('NEXTAUTH_URL or NEXT_PUBLIC_APP_URL must be set in production.');
    }

    const publicUrl = parsed.NEXT_PUBLIC_APP_URL ?? parsed.NEXTAUTH_URL;
    if (publicUrl && /^http:\/\/(localhost|127\.0\.0\.1)/i.test(publicUrl)) {
      logger.warn('env.app_url.localhost', {
        reason: 'Set NEXT_PUBLIC_APP_URL and NEXTAUTH_URL to the public production URL.',
      });
    }

    if (!parsed.NEXTAUTH_URL) {
      logger.warn('env.nextauth_url.missing', {
        reason: 'NextAuth requires NEXTAUTH_URL in production.',
      });
    }

    const smtpConfigured = Boolean(parsed.SMTP_HOST?.trim());
    const resendConfigured = Boolean(
      parsed.RESEND_API_KEY && !parsed.RESEND_API_KEY.toLowerCase().includes('mock')
    );
    if (!smtpConfigured && !resendConfigured) {
      logger.warn('env.email.not_configured', {
        reason: 'Verification and reset emails will not be delivered until SMTP or Resend is configured.',
      });
    }

    if (!parsed.UPSTASH_REDIS_REST_URL || !parsed.UPSTASH_REDIS_REST_TOKEN) {
      logger.warn('env.rate_limit.memory_fallback', {
        reason: 'UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not configured',
      });
    }

    if (!parsed.CRON_SECRET) {
      logger.warn('env.cron.secret_missing', {
        reason: 'CRON_SECRET is required to run the reconciliation job',
      });
    }
  }

  return parsed;
}

export const env = parseEnv();

export const isProduction = env.NODE_ENV === 'production';

export const appUrl = (
  env.NEXT_PUBLIC_APP_URL ||
  env.NEXTAUTH_URL ||
  'http://localhost:3000'
).replace(/\/+$/, '');
