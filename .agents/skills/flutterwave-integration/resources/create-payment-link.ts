/**
 * Reference: payment link creation and transaction verification for Flutterwave.
 *
 * Split as you like, but keep the boundary in one place. Two functions belong in
 * lib/flutterwave.ts; the route handler belongs in app/api/orders/route.ts.
 * Related: skills/flutterwave-integration/SKILL.md
 *
 * The one thing that must not drift: our database stores kobo, Flutterwave speaks
 * naira. Every conversion lives in `koboToNaira` below.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

const FLW_BASE_URL = 'https://api.flutterwave.com/v3';
const CURRENCY = 'NGN';

type Success<T> = { ok: true; data: T };
type Failure = { ok: false; error: { code: string; message: string } };

/**
 * Our database stores integer kobo. Flutterwave's API expects integer naira.
 * Getting this wrong charges the buyer 100x too much, silently.
 */
function koboToNaira(kobo: number): number {
  return Math.round(kobo / 100);
}

/**
 * tx_ref is Order.transactionReference. Generate it once, at Order creation, and
 * never regenerate it. Retrying a payment means creating a new Order, not minting
 * a new reference on the existing one.
 *
 * Call this exactly once per Order and reuse the returned string everywhere. Two
 * calls means two references, and the stored one will not match the one Flutterwave
 * knows about, so the webhook will never settle the order.
 */
function generateTxRef(): string {
  return `sellsnap_${randomBytes(8).toString('hex')}`;
}

function authHeaders() {
  const secretKey = process.env.FLW_SECRET_KEY;
  if (!secretKey) throw new Error('FLW_SECRET_KEY is not configured');

  return {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  };
}

type CreatePaymentLinkInput = {
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

export async function createPaymentLink(input: CreatePaymentLinkInput) {
  const siteUrl = process.env.NEXTAUTH_URL;

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

  if (!response.ok || payload?.status !== 'success') {
    // Log the status, not the secret key or Authorization header.
    logger.error('flutterwave.create_payment_link.failed', {
      status: response.status,
      message: payload?.message,
    });
    return null;
  }

  return payload.data.link as string;
}

type VerifiedTransaction = {
  id: number;
  tx_ref: string;
  status: string;
  amount: number;
  currency: string;
};

/**
 * Returns null when the transaction cannot be confirmed. Callers must treat null as
 * "do not mark paid" rather than as an error worth retrying loudly.
 */
export async function verifyTransaction(
  transactionId: number
): Promise<VerifiedTransaction | null> {
  const response = await fetch(`${FLW_BASE_URL}/transactions/${transactionId}/verify`, {
    method: 'GET',
    headers: authHeaders(),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.status !== 'success' || !payload?.data) {
    logger.error('flutterwave.verify_transaction.failed', {
      transactionId,
      status: response.status,
    });
    return null;
  }

  const { id, tx_ref, status, amount, currency } = payload.data;
  return { id, tx_ref, status, amount, currency };
}

// --- Route handler: POST /api/orders -----------------------------------------

const createOrderSchema = z.object({
  slug: z.string().min(1),
  buyerEmail: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json<Failure>(
        { ok: false, error: { code: 'invalid_input', message: 'Check your input and try again.' } },
        { status: 400 }
      );
    }

    const product = await db.product.findUnique({
      where: { uniqueSlug: parsed.data.slug },
      include: { user: true },
    });

    // A deleted product must show "not available", not a raw 404, per AGENTS.md.
    if (!product) {
      return NextResponse.json<Failure>(
        { ok: false, error: { code: 'not_found', message: 'Product not available.' } },
        { status: 404 }
      );
    }

    // Flutterwave requires customer.email. Fail here rather than sending "".
    if (!parsed.data.buyerEmail) {
      return NextResponse.json<Failure>(
        { ok: false, error: { code: 'invalid_input', message: 'Enter your email to continue.' } },
        { status: 400 }
      );
    }

    // Set once, here, and never touched again. Order.transactionReference is
    // @unique and single-valued, so the reference must exist at insert time.
    const txRef = generateTxRef();

    const order = await db.order.create({
      data: {
        productId: product.id,
        buyerEmail: parsed.data.buyerEmail,
        amount: product.price,
        status: 'pending',
        transactionReference: txRef,
      },
    });

    const link = await createPaymentLink({
      txRef,
      amountKobo: product.price,
      buyerEmail: parsed.data.buyerEmail,
      slug: product.uniqueSlug,
      productName: product.name,
      sellerBusinessName: product.user.businessName,
      orderId: order.id,
      productId: product.id,
      sellerId: product.userId,
    });

    if (!link) {
      await db.order.update({ where: { id: order.id }, data: { status: 'failed' } });
      return NextResponse.json<Failure>(
        { ok: false, error: { code: 'server_error', message: 'Could not start the payment.' } },
        { status: 502 }
      );
    }

    return NextResponse.json<Success<{ url: string }>>(
      { ok: true, data: { url: link } },
      { status: 201 }
    );
  } catch (error) {
    logger.error('api.orders.create.failed', { error });
    return NextResponse.json<Failure>(
      { ok: false, error: { code: 'server_error', message: 'Something went wrong.' } },
      { status: 500 }
    );
  }
}