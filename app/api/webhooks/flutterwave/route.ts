import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { fail, ok } from '@/lib/api-response';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  FlutterwaveTransientError,
  verifyTransaction,
  type VerifiedTransaction,
} from '@/lib/flutterwave';
import { settleVerifiedTransaction } from '@/lib/payments';
import { recordPaymentLog } from '@/lib/payment-log';

const webhookSchema = z
  .object({
    // Flutterwave v3 sends `event` (e.g. "charge.completed"). `type` is kept as a
    // fallback for older payloads; the API has used both names historically.
    event: z.string().optional(),
    type: z.string().optional(),
    data: z.object({
      id: z.coerce.number().int(),
      // Both fields are always present on charge.completed payloads. They are
      // not trusted for settlement (the verify API is the source of truth), but
      // requiring them rejects payloads that could not have come from
      // Flutterwave.
      tx_ref: z.string().min(1),
      status: z.string().min(1),
    }),
  })
  .refine((payload) => Boolean(payload.event || payload.type), {
    message: 'Missing event type',
  });

function isValidSecretHash(header: string | null): boolean {
  const secret = env.FLW_SECRET_HASH;
  if (!header || !secret) return false;

  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  try {
    // 1. Check signature header using timingSafeEqual
    if (!isValidSecretHash(req.headers.get('verif-hash'))) {
      logger.warn('webhooks.flutterwave.invalid_signature', {});
      // No request data is persisted: the payload is untrusted.
      await recordPaymentLog({ event: 'webhook', outcome: 'invalid_signature' });
      return fail(401, 'unauthorized', 'Invalid signature.');
    }

    // 2. Defense in depth: reject non-JSON bodies before parsing them.
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      logger.warn('webhooks.flutterwave.invalid_content_type', { contentType });
      await recordPaymentLog({ event: 'webhook', outcome: 'invalid_content_type' });
      return fail(400, 'invalid_input', 'Expected application/json.');
    }

    // 3. Validate payload with zod
    const body = await req.json().catch(() => null);
    const parsed = webhookSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn('webhooks.flutterwave.invalid_payload', {
        issueCount: parsed.error.issues.length,
        issuePaths: parsed.error.issues
          .map((issue) => issue.path.join('.'))
          .filter(Boolean)
          .slice(0, 5),
      });
      // Zod issues can echo raw request values; do not persist them.
      await recordPaymentLog({ event: 'webhook', outcome: 'invalid_payload' });
      return fail(400, 'invalid_input', 'Invalid payload.');
    }

    const { data } = parsed.data;
    const eventType = parsed.data.event ?? parsed.data.type ?? '';

    // 4. Filter on actionable event types. Failed payments arrive as
    // "charge.completed" with data.status = "failed", so the verify response below
    // is what decides the final state.
    if (eventType !== 'charge.completed' && eventType !== 'charge.failed') {
      logger.info('webhooks.flutterwave.event_ignored', { eventType });
      await recordPaymentLog({
        event: 'webhook',
        outcome: 'event_ignored',
        gatewayReference: String(data.id),
        detail: { eventType },
      });
      return ok({ status: 'ignored' });
    }

    // 5. Verify transaction with Flutterwave API (never trust body alone).
    let verified: VerifiedTransaction | null;
    try {
      verified = await verifyTransaction(data.id);
    } catch (error) {
      if (error instanceof FlutterwaveTransientError) {
        // Transient: tell Flutterwave to retry so a network blip does not leave
        // the order pending forever.
        logger.warn('webhooks.flutterwave.verify_transient', {
          transactionId: data.id,
          eventType,
        });
        await recordPaymentLog({
          event: 'webhook',
          outcome: 'verify_transient',
          transactionReference: data.tx_ref,
          gatewayReference: String(data.id),
          detail: { eventType },
        });
        return fail(
          503,
          'gateway_unavailable',
          'Flutterwave verification is temporarily unavailable.'
        );
      }

      logger.error('webhooks.flutterwave.verify_error', { error });
      return fail(500, 'server_error', 'Failed to verify transaction.');
    }

    if (!verified) {
      // Permanent failure: the transaction is not usable. Acknowledge so
      // Flutterwave stops retrying; the audit trail records why.
      logger.warn('webhooks.flutterwave.verify_failed', {
        transactionId: data.id,
        eventType,
      });
      await recordPaymentLog({
        event: 'webhook',
        outcome: 'verify_failed',
        transactionReference: data.tx_ref,
        gatewayReference: String(data.id),
        detail: { eventType },
      });
      return ok({ status: 'unverified' });
    }

    // 6. Settle idempotently. The verify response is the source of truth, so a
    // failed charge, a retried webhook, and an unknown tx_ref all resolve here.
    const result = await settleVerifiedTransaction(verified);
    return ok({ status: result.status });
  } catch (error) {
    logger.error('webhooks.flutterwave.settle_failed', { error });
    return fail(500, 'server_error', 'Failed to settle order.');
  }
}
