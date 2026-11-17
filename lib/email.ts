import nodemailer from 'nodemailer';
import { env, isProduction } from '@/lib/env';
import { logger } from '@/lib/logger';

export type EmailInput = {
  to: string;
  subject: string;
  text: string;
  /**
   * Development-only preview of a link that would normally travel in the email
   * body. Only ever surfaced when no real mail provider is configured, and
   * never in production.
   */
  devPreview?: string;
};

export type EmailResult = {
  sent: boolean;
};

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_SENDER = 'SellSnap <notifications@sellsnap.app>';

function getSender(): string {
  const from = env.EMAIL_FROM?.trim();
  if (from) return from;

  const smtpUser = env.SMTP_USER?.trim();
  if (smtpUser) return `SellSnap <${smtpUser}>`;

  return DEFAULT_SENDER;
}

function isMockKey(key: string | undefined): boolean {
  return !key || key.toLowerCase().includes('mock');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sendViaSmtp(input: EmailInput): Promise<EmailResult> {
  const host = env.SMTP_HOST!.trim();
  const port = Number(env.SMTP_PORT || '587');
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.replace(/\s+/g, '');

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      ...(user ? { auth: { user, pass: pass ?? '' } } : {}),
    });

    await transport.sendMail({
      from: getSender(),
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    logger.info('email.sent', { subject: input.subject, transport: 'smtp' });
    return { sent: true };
  } catch (error) {
    logger.error('email.send.error', {
      subject: input.subject,
      transport: 'smtp',
      reason: errorMessage(error),
    });
    return { sent: false };
  }
}

async function sendViaResend(input: EmailInput, resendKey: string): Promise<EmailResult> {
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getSender(),
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });

    if (!res.ok) {
      logger.error('email.send.failed', {
        subject: input.subject,
        transport: 'resend',
        status: res.status,
        reason: await res.text(),
      });
      return { sent: false };
    }

    logger.info('email.sent', { subject: input.subject, transport: 'resend' });
    return { sent: true };
  } catch (error) {
    logger.error('email.send.error', {
      subject: input.subject,
      transport: 'resend',
      reason: errorMessage(error),
    });
    return { sent: false };
  }
}

/**
 * Sends a transactional email. Transport precedence: SMTP when SMTP_HOST is
 * set (local catch-all or Gmail), then Resend when a real API key exists.
 *
 * Never throws: a failed email must not take down the request that triggered
 * it. The caller decides what a "not sent" result means.
 */
export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  if (env.SMTP_HOST?.trim()) {
    return sendViaSmtp(input);
  }

  const resendKey = env.RESEND_API_KEY;
  if (!isMockKey(resendKey)) {
    return sendViaResend(input, resendKey!);
  }

  if (!isProduction && input.devPreview) {
    logger.info('email.send.preview', {
      subject: input.subject,
      devPreview: input.devPreview,
    });
  } else {
    logger.info('email.send.skipped', { subject: input.subject });
  }
  return { sent: false };
}
