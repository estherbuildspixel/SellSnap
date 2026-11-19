import React from 'react';
import Link from 'next/link';
import {
  MdCheck,
  MdClose,
  MdHourglassTop,
  MdInfo,
} from 'react-icons/md';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { db } from '@/lib/db';
import { verifyOrderOnBuyerReturn } from '@/lib/payments';
import { firstQueryValue } from '@/lib/utils';
import { PaymentStatusRefresher } from './_components/PaymentStatusRefresher';
import styles from './success.module.css';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    tx_ref?: string | string[];
    transaction_id?: string | string[];
  }>;
};

type PaymentState = 'paid' | 'pending' | 'failed' | 'unknown';

const copy: Record<
  PaymentState,
  { icon: React.ReactNode; title: string; subtitle: string; notice: string }
> = {
  paid: {
    icon: <MdCheck size={32} aria-hidden="true" />,
    title: 'Payment Received',
    subtitle: 'Your payment was successful. The seller has been notified.',
    notice:
      'A confirmation receipt will be sent to your email address once fully settled.',
  },
  pending: {
    icon: <MdHourglassTop size={32} aria-hidden="true" />,
    title: 'Confirming Payment',
    subtitle:
      'Flutterwave is securely confirming your transaction with the seller.',
    notice:
      'This usually takes a few seconds. Keep this page open and refresh it if the status does not update.',
  },
  failed: {
    icon: <MdClose size={32} aria-hidden="true" />,
    title: 'Payment Failed',
    subtitle:
      'Flutterwave could not complete this payment. You have not been charged for a successful order.',
    notice:
      'You can return to the product page and try again with a different payment method.',
  },
  unknown: {
    icon: <MdInfo size={32} aria-hidden="true" />,
    title: 'Payment Status Unavailable',
    subtitle:
      'We could not find an order for this payment reference. If you were charged, contact the seller with the reference below.',
    notice:
      'Please do not resend payment until the seller confirms the status of this transaction.',
  },
};

export default async function PaymentSuccessPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { tx_ref, transaction_id } = await searchParams;
  const txRef = firstQueryValue(tx_ref);
  const transactionIdValue = firstQueryValue(transaction_id);

  const parsedTransactionId = Number(transactionIdValue);
  const transactionId =
    Number.isInteger(parsedTransactionId) && parsedTransactionId > 0
      ? parsedTransactionId
      : undefined;

  let state: PaymentState = 'unknown';
  let reference = txRef;

  if (txRef || transactionId) {
    try {
      // DEVELOPMENT ONLY: Flutterwave cannot reach localhost webhooks, so ask
      // the verify API for the real status on the buyer return. This is a no-op
      // in production, where only the signed webhook may settle an order.
      const verification = await verifyOrderOnBuyerReturn(txRef, transactionId);
      reference = verification?.transactionReference ?? txRef;

      if (reference) {
        const order = await db.order.findUnique({
          where: { transactionReference: reference },
        });

        if (order) {
          state = order.status;
        }
      }
    } catch {
      // DB/gateway unavailable: fall back to the neutral "we are checking" copy.
      state = 'pending';
    }
  }

  const content = copy[state];

  return (
    <main className={styles.wrapper}>
      {state === 'pending' && <PaymentStatusRefresher />}

      <Card className={styles.card} variant="elevated">
        <div className={styles.iconCircle} data-status={state}>
          <span>{content.icon}</span>
        </div>

        <h1 className={styles.title}>{content.title}</h1>
        <p className={styles.subtitle}>{content.subtitle}</p>

        {reference && (
          <div className={styles.refBox}>
            <span className={styles.refLabel}>Payment Reference:</span>
            <code className={styles.refValue}>{reference}</code>
          </div>
        )}

        <div className={styles.noticeBox}>
          <span className={styles.noticeIcon}>
            <MdInfo size={18} aria-hidden="true" />
          </span>
          <p className={styles.noticeText}>{content.notice}</p>
        </div>

        <div className={styles.actions}>
          <Link href={`/p/${slug}`}>
            <Button variant="secondary" size="md" className={styles.btn}>
              {state === 'failed' ? 'Try Payment Again' : 'Return to Product'}
            </Button>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="md" className={styles.btn}>
              SellSnap Home
            </Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
