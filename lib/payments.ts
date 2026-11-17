import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { env, isProduction } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  FlutterwaveTransientError,
  koboToNaira,
  nairaToKobo,
  verifyTransaction,
  verifyTransactionByRef,
  type VerifiedTransaction,
} from '@/lib/flutterwave';
import { enqueueOrderPaidEmails } from '@/lib/jobs';
import { recordPaymentLog } from '@/lib/payment-log';

const CURRENCY = 'NGN';

export type SettlementStatus =
  | 'paid'
  | 'failed'
  | 'pending'
  | 'mismatch'
  | 'unknown_order'
  | 'already_processed'
  | 'unverified';

export type SettlementResult = {
  status: SettlementStatus;
  orderId?: string;
  transactionReference?: string;
};

/**
 * Settle an Order using a transaction that has already been verified against
 * Flutterwave's API.
 *
 * TRUST BOUNDARY: in production the Flutterwave webhook is the only caller. It
 * must have validated the `verif-hash` signature before calling this function.
 * The one exception is `verifyOrderOnBuyerReturn`, which is compiled out of
 * production and exists only because Flutterwave cannot reach localhost during
 * development.
 *
 * The verify response is the source of truth. The webhook event name and the
 * browser redirect status are never trusted on their own.
 */
export async function settleVerifiedTransaction(
  verified: VerifiedTransaction
): Promise<SettlementResult> {
  const order = await db.order.findUnique({
    where: { transactionReference: verified.tx_ref },
  });

  if (!order) {
    logger.warn('payments.settle.order_not_found', {
      transactionReference: verified.tx_ref,
    });
    await recordPaymentLog({
      event: 'settlement',
      outcome: 'order_not_found',
      transactionReference: verified.tx_ref,
      gatewayReference: String(verified.id),
      amountKobo: nairaToKobo(verified.amount),
    });
    return { status: 'unknown_order' };
  }

  // Fast idempotency path: Flutterwave retries webhook deliveries.
  if (order.status === 'paid') {
    logger.info('payments.settle.already_paid', { orderId: order.id });
    await recordPaymentLog({
      event: 'settlement',
      outcome: 'already_paid',
      orderId: order.id,
      transactionReference: order.transactionReference,
      gatewayReference: String(verified.id),
    });
    return { status: 'already_processed', orderId: order.id };
  }

  if (verified.tx_ref !== order.transactionReference) {
    logger.warn('payments.settle.tx_ref_mismatch', { orderId: order.id });
    await recordPaymentLog({
      event: 'settlement',
      outcome: 'tx_ref_mismatch',
      orderId: order.id,
      transactionReference: verified.tx_ref,
      gatewayReference: String(verified.id),
    });
    return { status: 'mismatch', orderId: order.id };
  }

  if (verified.currency !== CURRENCY) {
    logger.warn('payments.settle.currency_mismatch', {
      orderId: order.id,
      expected: CURRENCY,
      actual: verified.currency,
    });
    await recordPaymentLog({
      event: 'settlement',
      outcome: 'currency_mismatch',
      orderId: order.id,
      transactionReference: order.transactionReference,
      gatewayReference: String(verified.id),
      amountKobo: nairaToKobo(verified.amount),
      detail: { expectedCurrency: CURRENCY, actualCurrency: verified.currency },
    });
    return { status: 'mismatch', orderId: order.id };
  }

  // Gateway boundary: Flutterwave reports naira, the database stores kobo.
  // The buyer must have paid at least the listed price: an underpaid charge
  // never settles, an overpaid one does (the seller is not shortchanged).
  const expectedAmountNaira = koboToNaira(order.amount);
  if (verified.amount < expectedAmountNaira) {
    logger.warn('payments.settle.amount_underpaid', {
      orderId: order.id,
      expected: expectedAmountNaira,
      actual: verified.amount,
    });
    await recordPaymentLog({
      event: 'settlement',
      outcome: 'amount_underpaid',
      orderId: order.id,
      transactionReference: order.transactionReference,
      gatewayReference: String(verified.id),
      amountKobo: nairaToKobo(verified.amount),
      detail: { expectedKobo: order.amount, paidKobo: nairaToKobo(verified.amount) },
    });
    return { status: 'mismatch', orderId: order.id };
  }

  if (verified.status === 'failed') {
    await db.order.update({
      where: { id: order.id },
      data: { status: 'failed' },
    });

    logger.info('payments.settle.order_failed', { orderId: order.id });
    await recordPaymentLog({
      event: 'settlement',
      outcome: 'order_failed',
      orderId: order.id,
      transactionReference: order.transactionReference,
      gatewayReference: String(verified.id),
      amountKobo: nairaToKobo(verified.amount),
    });
    return { status: 'failed', orderId: order.id };
  }

  if (verified.status !== 'successful') {
    // pending / abandoned: leave the Order pending. Only a later successful
    // webhook can settle it.
    logger.info('payments.settle.order_pending', {
      orderId: order.id,
      status: verified.status,
    });
    await recordPaymentLog({
      event: 'settlement',
      outcome: 'order_pending',
      orderId: order.id,
      transactionReference: order.transactionReference,
      gatewayReference: String(verified.id),
      amountKobo: nairaToKobo(verified.amount),
      detail: { gatewayStatus: verified.status },
    });
    return { status: 'pending', orderId: order.id };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'paid' },
      });

      // Payment.orderId is @unique. A concurrent webhook delivery that got past
      // the status check above fails here, and P2002 is the hard idempotency
      // guarantee.
      await tx.payment.create({
        data: {
          orderId: order.id,
          gatewayReference: String(verified.id),
          status: 'successful',
          paidAt: new Date(),
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      logger.warn('payments.settle.duplicate', { orderId: order.id });
      await recordPaymentLog({
        event: 'settlement',
        outcome: 'duplicate_blocked',
        orderId: order.id,
        transactionReference: order.transactionReference,
        gatewayReference: String(verified.id),
        amountKobo: nairaToKobo(verified.amount),
      });
      return { status: 'already_processed', orderId: order.id };
    }

    throw error;
  }

  await recordPaymentLog({
    event: 'settlement',
    outcome: 'paid',
    orderId: order.id,
    transactionReference: order.transactionReference,
    gatewayReference: String(verified.id),
    amountKobo: nairaToKobo(verified.amount),
  });

  // Off the request path: the caller has already committed the settlement.
  await enqueueOrderPaidEmails({ orderId: order.id });

  logger.info('payments.settle.order_paid', { orderId: order.id });
  return { status: 'paid', orderId: order.id };
}

/**
 * Verify a transaction against Flutterwave and settle the matching Order.
 * Callers must already be trusted; see `verifyOrderOnBuyerReturn` for the
 * development-only entry point.
 */
async function verifyAndSettleOrder(input: {
  transactionReference?: string;
  transactionId?: number;
}): Promise<SettlementResult> {
  if (!input.transactionReference && !input.transactionId) {
    return { status: 'unverified' };
  }

  let verified: VerifiedTransaction | null = null;
  let reference = input.transactionReference;

  // Prefer the transaction id: Flutterwave appends it to the redirect and it
  // cannot be mangled by query-string merging. Its verified tx_ref is the
  // authoritative reference used to find the order.
  if (input.transactionId) {
    try {
      verified = await verifyTransaction(input.transactionId);
    } catch (error) {
      if (error instanceof FlutterwaveTransientError) {
        logger.warn('payments.verify.transient', {
          transactionId: input.transactionId,
        });
        return { status: 'unverified', transactionReference: reference };
      }
      throw error;
    }

    if (!verified) {
      logger.warn('payments.verify.unverified_by_id', {
        transactionId: input.transactionId,
      });
      return { status: 'unverified', transactionReference: reference };
    }

    reference = verified.tx_ref;
  }

  if (!reference) {
    return { status: 'unverified' };
  }

  const order = await db.order.findUnique({
    where: { transactionReference: reference },
  });

  if (!order) {
    logger.warn('payments.verify.order_not_found', {
      transactionReference: reference,
    });
    return { status: 'unknown_order', transactionReference: reference };
  }

  if (order.status === 'paid') {
    return {
      status: 'already_processed',
      orderId: order.id,
      transactionReference: reference,
    };
  }

  if (!verified) {
    try {
      verified = await verifyTransactionByRef(reference);
    } catch (error) {
      if (error instanceof FlutterwaveTransientError) {
        logger.warn('payments.verify.transient_by_ref', {
          transactionReference: reference,
        });
        return {
          status: 'unverified',
          orderId: order.id,
          transactionReference: reference,
        };
      }
      throw error;
    }

    if (!verified) {
      logger.warn('payments.verify.unverified', {
        transactionReference: reference,
      });
      return { status: 'unverified', orderId: order.id, transactionReference: reference };
    }
  }

  const result = await settleVerifiedTransaction(verified);
  return {
    ...result,
    orderId: result.orderId ?? order.id,
    transactionReference: reference,
  };
}

/**
 * DEVELOPMENT ONLY. Flutterwave cannot deliver webhooks to localhost, so a
 * payment would otherwise stay pending forever on the success page. This asks
 * Flutterwave's API for the real transaction status on the buyer return and
 * settles it.
 *
 * Two independent guards keep this off the production settlement path:
 * NODE_ENV must not be production, and the operator must explicitly opt in with
 * ENABLE_DEV_VERIFY=true. NODE_ENV alone is too easy to misconfigure on a
 * deployment to be the only line of defense.
 */
export async function verifyOrderOnBuyerReturn(
  transactionReference?: string,
  transactionId?: number
): Promise<SettlementResult | null> {
  if (isProduction || env.ENABLE_DEV_VERIFY !== 'true') {
    // Expected path: the signed webhook is the only settlement authority.
    return null;
  }

  return verifyAndSettleOrder({ transactionReference, transactionId });
}
