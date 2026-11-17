import { after } from 'next/server';
import { db } from '@/lib/db';
import { appUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { formatNaira } from '@/lib/utils';
import { sendEmail } from '@/lib/email';

export type OrderPaidEmailsPayload = {
  orderId: string;
};

export type WelcomeEmailPayload = {
  userId: string;
};

/**
 * Queue both post-sale notifications after the settlement transaction has
 * committed: the seller's payment alert and the buyer's receipt (sent only
 * when the buyer left an email at checkout).
 *
 * `after()` runs the callback once the response has been sent and, on Vercel,
 * keeps the serverless invocation alive until it finishes. That is what makes
 * the notifications reliable; the previous `setImmediate` callback could be
 * frozen or terminated before it ran.
 */
export async function enqueueOrderPaidEmails({ orderId }: OrderPaidEmailsPayload): Promise<void> {
  const deliver = async () => {
    try {
      const order = await db.order.findUnique({
        where: { id: orderId },
        include: {
          payment: true,
          product: {
            include: { user: true },
          },
        },
      });

      if (!order || !order.product || !order.product.user) {
        return;
      }

      const seller = order.product.user;
      const productName = order.product.name;
      const amountFormatted = formatNaira(order.amount);
      const buyerDisplay = order.buyerEmail || 'Anonymous Customer';
      const paidAt = order.payment?.paidAt ?? order.createdAt;

      // Log the order id only: buyer and seller email addresses are PII.
      logger.info('notification.order_paid.dispatched', {
        orderId,
        amountFormatted,
      });

      await sendEmail({
        to: seller.email,
        subject: `Payment received: ${amountFormatted} for ${productName}`,
        text: `Hi ${seller.name},\n\nYou have received a payment of ${amountFormatted} from ${buyerDisplay} for "${productName}".\n\nReference: ${order.transactionReference}\n\nCheck your SellSnap dashboard for details.`,
      });

      if (order.buyerEmail) {
        await sendEmail({
          to: order.buyerEmail,
          subject: `Your receipt: ${amountFormatted} for ${productName}`,
          text: [
            'Thank you for your purchase!',
            '',
            `You paid ${amountFormatted} to ${seller.businessName} for "${productName}".`,
            '',
            `Reference: ${order.transactionReference}`,
            `Date: ${paidAt.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}`,
            '',
            'Keep this email as your proof of payment.',
            '- SellSnap',
          ].join('\n'),
        });
      }
    } catch (error) {
      logger.error('notification.order_paid.failed', { orderId, error });
    }
  };

  try {
    after(deliver);
  } catch {
    // Outside a request lifecycle (a script or test), `after` is unavailable.
    // Deliver inline rather than dropping the notification.
    logger.warn('notification.after_unavailable', { orderId });
    await deliver();
  }
}

/**
 * Sends the welcome email shortly after signup, off the request path so the
 * signup response stays fast.
 */
export async function enqueueWelcomeEmail({ userId }: WelcomeEmailPayload): Promise<void> {
  const deliver = async () => {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, businessName: true },
      });

      if (!user) {
        return;
      }

      logger.info('notification.welcome.dispatched', { userId });

      await sendEmail({
        to: user.email,
        subject: 'Welcome to SellSnap',
        text: [
          `Hi ${user.name},`,
          '',
          `Your SellSnap account for ${user.businessName} is ready.`,
          '',
          'Getting started takes under a minute:',
          '1. Create a product - add a photo, description, and price.',
          '2. Copy your payment link.',
          '3. Share it on WhatsApp, Instagram, or anywhere your buyers are.',
          '',
          `Open your dashboard: ${appUrl}/dashboard`,
          '',
          '- SellSnap',
        ].join('\n'),
      });
    } catch (error) {
      logger.error('notification.welcome.failed', { userId, error });
    }
  };

  try {
    after(deliver);
  } catch {
    logger.warn('notification.after_unavailable', { userId });
    await deliver();
  }
}
