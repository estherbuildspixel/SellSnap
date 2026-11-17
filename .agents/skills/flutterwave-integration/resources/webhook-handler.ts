/**
 * Reference: Flutterwave webhook route handler.
 *
 * Copy to app/api/webhooks/flutterwave/route.ts and adapt to the current schema.
 * Related: skills/flutterwave-integration/SKILL.md
 *
 * Invariants this file exists to enforce:
 *  - Never trust the request body. Check `verif-hash`, validate with zod, then re-verify
 *    the transaction against Flutterwave's API.
 *  - Only `charge.completed` and `charge.failed` are actionable.
 *  - Duplicate deliveries are no-ops, enforced by Order.status and Payment.orderId.
 *  - Amounts are kobo in our database and naira at the gateway boundary.
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyTransaction } from '@/lib/flutterwave';
import { enqueueOrderPaidEmail } from '@/lib/jobs';

const CURRENCY = 'NGN';

const webhookSchema = z.object({
  type: z.string(),
  data: z.object({
    id: z.number().int(),
    tx_ref: z.string().optional(),
    status: z.string().optional(),
  }),
});

function isValidSecretHash(header: string | null): boolean {
  const secret = process.env.FLW_SECRET_HASH;
  if (!header || !secret) return false;

  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!isValidSecretHash(req.headers.get('verif-hash'))) {
    logger.warn('webhooks.flutterwave.invalid_signature', {});
    return NextResponse.json(
      { ok: false, error: { code: 'unauthorized', message: 'Invalid signature.' } },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = webhookSchema.safeParse(body);

  if (!parsed.success) {
    logger.warn('webhooks.flutterwave.invalid_payload', { issues: parsed.error.issues });
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_input', message: 'Invalid payload.' } },
      { status: 400 }
    );
  }

  const { type, data } = parsed.data;

  // Acknowledge everything we do not act on. Flutterwave retries anything non-200,
  // and retrying an event we will never handle is pure noise.
  if (type !== 'charge.completed' && type !== 'charge.failed') {
    logger.info('webhooks.flutterwave.event_ignored', { type });
    return NextResponse.json({ ok: true, data: { status: 'ignored' } }, { status: 200 });
  }

  const verified = await verifyTransaction(data.id);

  if (!verified) {
    logger.warn('webhooks.flutterwave.verify_failed', { transactionId: data.id, type });
    return NextResponse.json({ ok: true, data: { status: 'unverified' } }, { status: 200 });
  }

  const order = await db.order.findUnique({
    where: { transactionReference: verified.tx_ref },
  });

  if (!order) {
    logger.warn('webhooks.flutterwave.order_not_found', { transactionReference: verified.tx_ref });
    return NextResponse.json({ ok: true, data: { status: 'unknown_order' } }, { status: 200 });
  }

  // Fast idempotency path: already settled, so skip the write entirely.
  if (order.status === 'paid') {
    logger.info('webhooks.flutterwave.already_paid', { orderId: order.id });
    return NextResponse.json({ ok: true, data: { status: 'already_processed' } }, { status: 200 });
  }

  const isSuccessfulCharge = type === 'charge.completed';

  // Never trust `type` on its own. The verify response is the source of truth.
  if (isSuccessfulCharge && verified.status !== 'successful') {
    logger.warn('webhooks.flutterwave.status_mismatch', {
      orderId: order.id,
      expected: 'successful',
      actual: verified.status,
    });
    return NextResponse.json({ ok: true, data: { status: 'mismatch' } }, { status: 200 });
  }

  if (verified.tx_ref !== order.transactionReference) {
    logger.warn('webhooks.flutterwave.tx_ref_mismatch', { orderId: order.id });
    return NextResponse.json({ ok: true, data: { status: 'mismatch' } }, { status: 200 });
  }

  if (verified.currency !== CURRENCY) {
    logger.warn('webhooks.flutterwave.currency_mismatch', {
      orderId: order.id,
      expected: CURRENCY,
      actual: verified.currency,
    });
    return NextResponse.json({ ok: true, data: { status: 'mismatch' } }, { status: 200 });
  }

  // Flutterwave reports naira; our Order stores kobo.
  const expectedAmount = Math.round(order.amount / 100);

  if (verified.amount !== expectedAmount) {
    logger.warn('webhooks.flutterwave.amount_mismatch', {
      orderId: order.id,
      expected: expectedAmount,
      actual: verified.amount,
    });
    return NextResponse.json({ ok: true, data: { status: 'mismatch' } }, { status: 200 });
  }

  if (!isSuccessfulCharge) {
    await db.order.update({
      where: { id: order.id },
      data: { status: 'failed' },
    });

    logger.info('webhooks.flutterwave.order_failed', { orderId: order.id });
    return NextResponse.json({ ok: true, data: { status: 'failed' } }, { status: 200 });
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'paid' },
      });

      // Payment.orderId is @unique. A concurrent delivery that got past the
      // status check above will fail here, and P2002 is our hard idempotency guarantee.
      await tx.payment.create({
        data: {
          orderId: order.id,
          gatewayReference: String(data.id),
          status: 'successful',
          paidAt: new Date(),
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      logger.warn('webhooks.flutterwave.duplicate', { orderId: order.id });
      return NextResponse.json({ ok: true, data: { status: 'already_processed' } }, { status: 200 });
    }

    logger.error('webhooks.flutterwave.settle_failed', { orderId: order.id, error });
    return NextResponse.json(
      { ok: false, error: { code: 'server_error', message: 'Something went wrong.' } },
      { status: 500 }
    );
  }

  // After the transaction commits and off the response path. A slow handler gets
  // retried, and a retried handler re-sends the confirmation email.
  await enqueueOrderPaidEmail({ orderId: order.id });

  logger.info('webhooks.flutterwave.order_paid', { orderId: order.id });

  return NextResponse.json({ ok: true, data: { status: 'paid' } }, { status: 200 });
}