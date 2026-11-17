'use client';

import React, { useState } from 'react';
import { MdLock, MdShield } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import styles from './CheckoutForm.module.css';

export type CheckoutFormProps = {
  slug: string;
  priceInNairaFormatted: string;
};

export function CheckoutForm({ slug, priceInNairaFormatted }: CheckoutFormProps) {
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          buyerEmail,
          buyerName: buyerName || undefined,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result?.data?.paymentLink) {
        setError(result?.error?.message || 'Payment initiation failed. Please try again.');
        setIsLoading(false);
        return;
      }

      // Redirect immediately to Flutterwave's hosted checkout page
      window.location.href = result.data.paymentLink;
    } catch {
      setError('Could not connect to payment server. Please check your internet connection.');
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handlePay} className={styles.form}>
      {error && (
        <div className={styles.errorAlert} role="alert">
          {error}
        </div>
      )}

      <Input
        label="Email address (for receipt & order updates)"
        type="email"
        value={buyerEmail}
        onChange={(e) => setBuyerEmail(e.target.value)}
        placeholder="yourname@gmail.com"
        required
        autoComplete="email"
      />

      <Input
        label="Your full name (optional)"
        type="text"
        value={buyerName}
        onChange={(e) => setBuyerName(e.target.value)}
        placeholder="e.g. Tunde Williams"
        autoComplete="name"
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={isLoading}
        className={styles.payBtn}
      >
        {isLoading ? (
          'Connecting to Flutterwave...'
        ) : (
          <>
            Pay {priceInNairaFormatted} Now
            <MdLock size={16} aria-hidden="true" />
          </>
        )}
      </Button>

      <div className={styles.trustFooter}>
        <span className={styles.lockIcon}>
          <MdShield size={18} aria-hidden="true" />
        </span>
        <span>Secured 256-bit payment processed by Flutterwave</span>
      </div>
    </form>
  );
}
