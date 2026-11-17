import { randomBytes } from 'crypto';
import { appUrl, env } from '@/lib/env';
import { logger } from '@/lib/logger';

const FLW_BASE_URL = 'https://api.flutterwave.com/v3';
const CURRENCY = 'NGN';
const VERIFY_TIMEOUT_MS = 10_000;

/**
 * A verification failure that may succeed on retry (network blip, timeout,
 * 429, or a 5xx from Flutterwave). Callers should retry — the webhook returns
 * a retryable status and the reconciliation job picks it up later.
 */
export class FlutterwaveTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlutterwaveTransientError';
  }
}

/**
 * Our database stores integer kobo. Flutterwave's API expects integer naira.
 * Getting this wrong charges the buyer 100x too much or too little.
 */
export function koboToNaira(kobo: number): number {
  return Math.round(kobo / 100);
}

/**
 * Inverse of koboToNaira: convert a gateway-reported naira amount back to the
 * kobo the database stores, so PaymentLog rows are unit-consistent with
 * Product.price and Order.amount.
 */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/**
 * tx_ref is Order.transactionReference. Generate it once, at Order creation, and
 * never regenerate it. Retrying a payment means creating a new Order, not minting
 * a new reference on the existing one.
 */
export function generateTxRef(): string {
  return `sellsnap_${randomBytes(8).toString('hex')}`;
}

function authHeaders() {
  const secretKey = env.FLW_SECRET_KEY;
  if (!secretKey) {
    throw new Error('FLW_SECRET_KEY is not configured');
  }

  return {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  };
}

export type CreatePaymentLinkInput = {
  txRef: string;
  amountKobo: number;
  buyerEmail: string;
  buyerName?: string;
  slug: string;
  productName: string;
  sellerBusinessName: string;
  orderId: string;
  productId: string;
  sellerId: string;
};

export async function createPaymentLink(input: CreatePaymentLinkInput): Promise<string | null> {
  const siteUrl = appUrl;

  try {
    const response = await fetch(`${FLW_BASE_URL}/payments`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        tx_ref: input.txRef,
        amount: koboToNaira(input.amountKobo),
        currency: CURRENCY,
        redirect_url: `${siteUrl}/p/${input.slug}/success?tx_ref=${input.txRef}`,
        customer: {
          email: input.buyerEmail,
          name: input.buyerName ?? 'Buyer',
        },
        customizations: {
          title: input.sellerBusinessName,
          description: input.productName,
          logo: `${siteUrl}/logo.png`,
        },
        meta: {
          order_id: input.orderId,
          product_id: input.productId,
          seller_id: input.sellerId,
        },
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.status !== 'success' || !payload?.data?.link) {
      logger.error('flutterwave.create_payment_link.failed', {
        status: response.status,
        message: payload?.message,
      });
      return null;
    }

    return payload.data.link as string;
  } catch (error) {
    logger.error('flutterwave.create_payment_link.exception', { error });
    return null;
  }
}

export type VerifiedTransaction = {
  id: number;
  tx_ref: string;
  status: string;
  amount: number;
  currency: string;
};

/**
 * Flutterwave sometimes returns numerics as strings. Normalise once here so the
 * comparison in the webhook is an apples-to-apples number/string check.
 */
function toVerifiedTransaction(data: {
  id: number | string;
  tx_ref?: string | null;
  status?: string | null;
  amount?: number | string | null;
  currency?: string | null;
}): VerifiedTransaction {
  return {
    id: Number(data.id),
    tx_ref: String(data.tx_ref ?? ''),
    status: String(data.status ?? ''),
    amount: Number(data.amount),
    currency: String(data.currency ?? ''),
  };
}

/**
 * Shared verify request. Returns null only for permanent failures (the gateway
 * says the transaction is not usable). Throws FlutterwaveTransientError when a
 * retry could succeed.
 */
async function verifyRequest(
  url: string,
  logContext: Record<string, unknown>
): Promise<VerifiedTransaction | null> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch (error) {
    logger.error('flutterwave.verify_transaction.exception', { ...logContext, error });
    throw new FlutterwaveTransientError('Flutterwave verify request failed');
  }

  let payload: { status?: string; data?: unknown } | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  // 429 and 5xx are transient: Flutterwave may recover, so the caller should
  // retry rather than acknowledging the webhook permanently.
  if (response.status === 429 || response.status >= 500) {
    logger.error('flutterwave.verify_transaction.transient_status', {
      ...logContext,
      status: response.status,
    });
    throw new FlutterwaveTransientError(`Flutterwave returned HTTP ${response.status}`);
  }

  if (response.ok && payload === null) {
    logger.error('flutterwave.verify_transaction.invalid_response', {
      ...logContext,
      status: response.status,
    });
    throw new FlutterwaveTransientError('Flutterwave returned an unreadable response');
  }

  if (!response.ok || payload?.status !== 'success' || !payload?.data) {
    logger.error('flutterwave.verify_transaction.failed', {
      ...logContext,
      status: response.status,
    });
    return null;
  }

  return toVerifiedTransaction(payload.data as Parameters<typeof toVerifiedTransaction>[0]);
}

/**
 * Returns null when the transaction cannot be confirmed permanently. Throws
 * FlutterwaveTransientError when the failure is retryable.
 */
export async function verifyTransaction(transactionId: number): Promise<VerifiedTransaction | null> {
  return verifyRequest(`${FLW_BASE_URL}/transactions/${transactionId}/verify`, {
    transactionId,
  });
}

/**
 * Verify a transaction by our tx_ref. Used by the reconciliation cron and the
 * development-only verify-on-return fallback.
 */
export async function verifyTransactionByRef(
  txRef: string
): Promise<VerifiedTransaction | null> {
  return verifyRequest(
    `${FLW_BASE_URL}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
    { txRef }
  );
}

