import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  enforceRateLimit,
  fail,
  ok,
  rateLimited,
} from '@/lib/api-response';
import { db } from '@/lib/db';
import { createPaymentLink, generateTxRef } from '@/lib/flutterwave';
import { logger } from '@/lib/logger';
import { recordPaymentLog } from '@/lib/payment-log';
import { getClientIp } from '@/lib/request';

const orderCreateSchema = z.object({
  slug: z.string().min(1, 'Product slug is required'),
  buyerEmail: z.string().email('Please enter a valid email address').toLowerCase().trim(),
  buyerName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const limited = await enforceRateLimit(
      `api.orders.create:${ip}`,
      10,
      60000,
      'Too many requests. Please try again shortly.'
    );
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    const parsed = orderCreateSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Please check your inputs.';
      return fail(400, 'invalid_input', message);
    }

    const { slug, buyerEmail, buyerName } = parsed.data;

    // 3. Load product
    const product = await db.product.findUnique({
      where: { uniqueSlug: slug },
      include: { user: true },
    });

    if (!product) {
      // Per AGENTS.md: return "Product not available" message, code: not_found
      return fail(404, 'not_found', 'This product is no longer available.');
    }

    // 3b. Cooldown: a buyer hammering "Pay Now" must not create a pile of
    // pending orders. A recent pending order for the same buyer + product means
    // a checkout is already in flight.
    const recentPendingOrder = await db.order.findFirst({
      where: {
        productId: product.id,
        buyerEmail,
        status: 'pending',
        createdAt: { gte: new Date(Date.now() - 60 * 1000) },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    if (recentPendingOrder) {
      return rateLimited(
        60,
        'A payment for this product is already in progress. Complete it or wait a minute before trying again.'
      );
    }

    // 4. Generate transactionReference ONCE
    const transactionReference = generateTxRef();

    // 5. Create pending order in database (price stored in kobo)
    const order = await db.order.create({
      data: {
        productId: product.id,
        buyerEmail,
        amount: product.price,
        status: 'pending',
        transactionReference,
      },
    });

    logger.info('order.created', {
      orderId: order.id,
      productId: product.id,
      amountKobo: order.amount,
      txRef: transactionReference,
    });

    // 6. Request Flutterwave payment link (kobo converted to Naira at the gateway boundary)
    const paymentLink = await createPaymentLink({
      txRef: transactionReference,
      amountKobo: order.amount,
      buyerEmail,
      buyerName: buyerName || 'Customer',
      slug: product.uniqueSlug,
      productName: product.name,
      sellerBusinessName: product.user?.businessName || 'SellSnap Vendor',
      orderId: order.id,
      productId: product.id,
      sellerId: product.userId,
    });

    if (!paymentLink) {
      // Mark order failed and return 502
      await db.order.update({
        where: { id: order.id },
        data: { status: 'failed' },
      });
      await recordPaymentLog({
        event: 'payment_link',
        outcome: 'gateway_error',
        orderId: order.id,
        transactionReference,
        amountKobo: order.amount,
      });
      return fail(502, 'gateway_error', 'Unable to initiate payment with Flutterwave. Please try again.');
    }

    await recordPaymentLog({
      event: 'payment_link',
      outcome: 'created',
      orderId: order.id,
      transactionReference,
      amountKobo: order.amount,
    });

    // 7. Return payment link
    return ok({
      paymentLink,
      transactionReference,
    });
  } catch (error) {
    logger.error('api.orders.create.failed', { error });
    return fail(500, 'server_error', 'Something went wrong while creating your order.');
  }
}
