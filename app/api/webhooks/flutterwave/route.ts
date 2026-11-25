import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { fail, ok } from '@/lib/api-response';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  FlutterwaveTransientError,
  verifyTransaction,
  verifyTransactionByRef,
  type VerifiedTransaction,
} from '@/lib/flutterwave';
import { settleVerifiedTransaction } from '@/lib/payments';
import { recordPaymentLog } from '@/lib/payment-log';

type ChargePayload = {
  id?: number;
  tx_ref: string;
  status: string;
};

type NormalizedWebhookPayload = {
  eventType: string;
  data: ChargePayload | null;
};

const transactionIdSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/).transform(Number),
]);

const chargePayloadSchema = z.object({
  id: transactionIdSchema.optional(),
  tx_ref: z.string().min(1),
  status: z.string().min(1),
});

const webhookEnvelopeSchema = z
  .object({
    event: z.unknown().optional(),
    type: z.unknown().optional(),
    data: z.unknown().optional(),
    id: z.unknown().optional(),
    txRef: z.unknown().optional(),
    status: z.unknown().optional(),
  })
  .passthrough();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function nonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function eventTypeFromPayload(
  payload: z.infer<typeof webhookEnvelopeSchema>,
  nestedData: Record<string, unknown> | null
): string | undefined {
  const explicit = nonEmptyString(payload.event, payload.type);
  if (explicit) return explicit;

  const status = nonEmptyString(payload.status, nestedData?.status)?.toLowerCase();
  if (status === 'successful' || status === 'success') return 'charge.completed';
  if (status === 'failed') return 'charge.failed';
  return undefined;
}

function isChargeEvent(eventType: string): boolean {
  return eventType === 'charge.completed' || eventType === 'charge.failed';
}

function chargePayloadFromPayload(
  payload: z.infer<typeof webhookEnvelopeSchema>,
  nestedData: Record<string, unknown> | null
): unknown {
  if (nestedData) {
    return {
      id: nestedData.id,
      tx_ref: nonEmptyString(nestedData.tx_ref, nestedData.txRef),
      status: nonEmptyString(nestedData.status),
    };
  }

  return {
    id: payload.id,
    tx_ref: nonEmptyString(payload.txRef, payload.tx_ref),
    status: nonEmptyString(payload.status),
  };
}

function issuePathForPayload(
  nestedData: Record<string, unknown> | null,
  issuePath: PropertyKey[]
): PropertyKey[] {
  if (nestedData) return ['data', ...issuePath];
  if (issuePath[0] === 'tx_ref') return ['txRef', ...issuePath.slice(1)];
  return issuePath;
}

const webhookSchema = webhookEnvelopeSchema.transform((payload, ctx) => {
  const nestedData = asRecord(payload.data);
  const eventType = eventTypeFromPayload(payload, nestedData);
  if (!eventType) {
    ctx.addIssue({ code: 'custom', message: 'Missing event type', path: ['event'] });
    return z.NEVER;
  }

  if (!isChargeEvent(eventType)) {
    return { eventType, data: null } satisfies NormalizedWebhookPayload;
  }

  const parsedData = chargePayloadSchema.safeParse(
    chargePayloadFromPayload(payload, nestedData)
  );
  if (!parsedData.success) {
    const firstIssue = parsedData.error.issues[0];
    ctx.addIssue({
      code: 'custom',
      message: 'Invalid charge payload',
      path: issuePathForPayload(nestedData, firstIssue?.path ?? []),
    });
    return z.NEVER;
  }

  return { eventType, data: parsedData.data } satisfies NormalizedWebhookPayload;
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

    const { data, eventType } = parsed.data;

    // 4. Filter on actionable event types. Failed payments arrive as
    // "charge.completed" with data.status = "failed", so the verify response below
    // is what decides the final state.
    if (!data || (eventType !== 'charge.completed' && eventType !== 'charge.failed')) {
      logger.info('webhooks.flutterwave.event_ignored', { eventType });
      await recordPaymentLog({
        event: 'webhook',
        outcome: 'event_ignored',
        ...(data?.id !== undefined ? { gatewayReference: String(data.id) } : {}),
        detail: { eventType },
      });
      return ok({ status: 'ignored' });
    }

    // 5. Verify transaction with Flutterwave API (never trust body alone).
    let verified: VerifiedTransaction | null;
    try {
      verified =
        data.id !== undefined
          ? await verifyTransaction(data.id)
          : await verifyTransactionByRef(data.tx_ref);
    } catch (error) {
      if (error instanceof FlutterwaveTransientError) {
        // Transient: tell Flutterwave to retry so a network blip does not leave
        // the order pending forever.
        logger.warn('webhooks.flutterwave.verify_transient', {
          transactionId: data.id,
          transactionReference: data.tx_ref,
          eventType,
        });
        await recordPaymentLog({
          event: 'webhook',
          outcome: 'verify_transient',
          transactionReference: data.tx_ref,
          ...(data.id !== undefined ? { gatewayReference: String(data.id) } : {}),
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
        transactionReference: data.tx_ref,
        eventType,
      });
      await recordPaymentLog({
        event: 'webhook',
        outcome: 'verify_failed',
        transactionReference: data.tx_ref,
        ...(data.id !== undefined ? { gatewayReference: String(data.id) } : {}),
        detail: { eventType },
      });
      return ok({ status: 'unverified' });
    }

    // 6. Settle idempotently. The verify response is the source of truth, so a
    // failed charge, a retried webhook, and an unknown tx_ref all resolve here.
    const result = await settleVerifiedTransaction(verified);
    if (result.status === 'paid' || result.status === 'already_processed') {
      revalidatePath('/orders');
    }
    return ok({ status: result.status });
  } catch (error) {
    logger.error('webhooks.flutterwave.settle_failed', { error });
    return fail(500, 'server_error', 'Failed to settle order.');
  }
}
