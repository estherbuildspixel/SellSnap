import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export type PaymentLogEvent =
  | 'payment_link'
  | 'webhook'
  | 'settlement'
  | 'reconciliation';

export type RecordPaymentLogInput = {
  event: PaymentLogEvent;
  outcome: string;
  orderId?: string;
  transactionReference?: string;
  gatewayReference?: string;
  amountKobo?: number;
  detail?: Prisma.InputJsonValue;
};

/**
 * Append one row to the PaymentLog audit trail.
 *
 * Never throws: a failed log write must not break settlement or the webhook
 * response. Errors fall back to the console logger only.
 */
export async function recordPaymentLog(input: RecordPaymentLogInput): Promise<void> {
  try {
    await db.paymentLog.create({ data: input });
  } catch (error) {
    logger.error('payment_log.write_failed', {
      event: input.event,
      outcome: input.outcome,
      orderId: input.orderId,
      transactionReference: input.transactionReference,
      gatewayReference: input.gatewayReference,
      error,
    });
  }
}
