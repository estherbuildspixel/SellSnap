import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { fail, ok } from '@/lib/api-response';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  FlutterwaveTransientError,
  verifyTransactionByRef,
} from '@/lib/flutterwave';
import { settleVerifiedTransaction } from '@/lib/payments';
import { recordPaymentLog } from '@/lib/payment-log';

/**
 * Payment reconciliation job.
 *
 * Flutterwave webhook delivery is not guaranteed. This job finds orders that
 * are still pending after 15 minutes, asks the verify API for the real status,
 * and settles them. It is protected by CRON_SECRET and intended to run every
 * five minutes (see vercel.json).
 */

const PENDING_AGE_MS = 15 * 60 * 1000;
const BATCH_SIZE = 50;

type ReconcileSummary = {
  checked: number;
  settled: number;
  failed: number;
  stillPending: number;
  errors: number;
};

function getCronSecretFromRequest(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return req.headers.get('x-cron-secret');
}

function isValidCronSecret(candidate: string | null): boolean {
  const secret = env.CRON_SECRET;
  if (!candidate || !secret) return false;

  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  try {
    if (!env.CRON_SECRET) {
      logger.error('cron.reconcile.secret_missing', {});
      return fail(503, 'server_error', 'Cron secret is not configured.');
    }

    if (!isValidCronSecret(getCronSecretFromRequest(req))) {
      logger.warn('cron.reconcile.unauthorized', {});
      return fail(401, 'unauthorized', 'Invalid cron secret.');
    }

    const cutoff = new Date(Date.now() - PENDING_AGE_MS);

    const orders = await db.order.findMany({
      where: {
        status: 'pending',
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        transactionReference: true,
        amount: true,
      },
    });

    const summary: ReconcileSummary = {
      checked: orders.length,
      settled: 0,
      failed: 0,
      stillPending: 0,
      errors: 0,
    };

    for (const order of orders) {
      try {
        const verified = await verifyTransactionByRef(order.transactionReference);

        if (!verified) {
          summary.stillPending += 1;
          await recordPaymentLog({
            event: 'reconciliation',
            outcome: 'verify_failed',
            orderId: order.id,
            transactionReference: order.transactionReference,
          });
          continue;
        }

        const result = await settleVerifiedTransaction(verified);

        await recordPaymentLog({
          event: 'reconciliation',
          outcome: `settled_${result.status}`,
          orderId: order.id,
          transactionReference: order.transactionReference,
          gatewayReference: String(verified.id),
          amountKobo: order.amount,
        });

        if (result.status === 'paid' || result.status === 'already_processed') {
          summary.settled += 1;
        } else if (result.status === 'failed') {
          summary.failed += 1;
        } else {
          summary.stillPending += 1;
        }
      } catch (error) {
        if (error instanceof FlutterwaveTransientError) {
          summary.stillPending += 1;
          logger.warn('cron.reconcile.transient', { orderId: order.id });
          await recordPaymentLog({
            event: 'reconciliation',
            outcome: 'verify_transient',
            orderId: order.id,
            transactionReference: order.transactionReference,
          });
        } else {
          summary.errors += 1;
          logger.error('cron.reconcile.order_failed', { orderId: order.id, error });
          await recordPaymentLog({
            event: 'reconciliation',
            outcome: 'error',
            orderId: order.id,
            transactionReference: order.transactionReference,
          });
        }
      }
    }

    logger.info('cron.reconcile.completed', summary);

    return ok(summary);
  } catch (error) {
    logger.error('cron.reconcile.failed', { error });
    return fail(500, 'server_error', 'Reconciliation failed.');
  }
}
