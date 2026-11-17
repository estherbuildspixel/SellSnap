'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MdCheck } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthCard } from '../../_components/AuthCard';
import { ErrorAlert } from '../../_components/ErrorAlert';
import styles from './ForgotPasswordForm.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setFieldError('Field cannot be empty');
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setFieldError('Please enter a valid email address.');
      return;
    }
    setFieldError(undefined);
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setError(data?.error?.message || 'We could not send the reset link. Please try again.');
        setIsLoading(false);
        return;
      }

      setSentMessage(data.data?.message ?? 'If an account exists for that email, we have sent a reset link.');
      setIsLoading(false);
    } catch {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  if (sentMessage) {
    return (
      <AuthCard
        title="Check your inbox"
        subtitle="If an account exists for that email, a reset link is on its way."
      >
        <div className={styles.success} role="status">
          <MdCheck
            className={styles.successIcon}
            size={22}
            aria-hidden="true"
          />
          <p className={styles.successText}>{sentMessage}</p>
        </div>

        <div className={styles.footer}>
          <p>
            <Link href="/auth" className={styles.link}>
              Back to sign in
            </Link>
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter the email you signed up with and we will send you a link to choose a new password."
      banner={error ? <ErrorAlert message={error} /> : undefined}
    >
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <Input
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldError(undefined);
          }}
          error={fieldError}
          onFocus={() => setError(null)}
          placeholder="vendor@example.com"
          required
          autoComplete="email"
          containerClassName={styles.field}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isLoading}
          className={styles.submitBtn}
        >
          {isLoading ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>

      <div className={styles.footer}>
        <p>
          Remembered it?{' '}
          <Link href="/auth" className={styles.link}>
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
