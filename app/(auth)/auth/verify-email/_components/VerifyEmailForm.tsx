'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MdCheckCircle } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthCard } from '../../_components/AuthCard';
import { ErrorAlert } from '../../_components/ErrorAlert';
import styles from './VerifyEmailForm.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type VerifyEmailFormProps = {
  initialEmail?: string;
  initialDevCode?: string;
};

export function VerifyEmailForm({ initialEmail = '', initialDevCode }: VerifyEmailFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(initialDevCode);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; code?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const validateEmail = () => {
    if (!email.trim()) {
      setFieldErrors((prev) => ({ ...prev, email: 'Field cannot be empty' }));
      return false;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setFieldErrors((prev) => ({ ...prev, email: 'Please enter a valid email address.' }));
      return false;
    }
    setFieldErrors((prev) => ({ ...prev, email: undefined }));
    return true;
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const validEmail = validateEmail();
    if (!/^\d{6}$/.test(code)) {
      setFieldErrors((prev) => ({ ...prev, code: 'Enter the 6-digit code from your email.' }));
      return;
    }
    setFieldErrors((prev) => ({ ...prev, code: undefined }));
    if (!validEmail) return;

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setError(data?.error?.message || 'We could not verify that code. Please try again.');
        setIsLoading(false);
        return;
      }

      router.push(`/auth?verified=1&email=${encodeURIComponent(email.trim())}`);
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setNotice(null);
    if (!validateEmail()) return;

    setIsResending(true);

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setError(data?.error?.message || 'We could not send a new code. Please try again.');
        setIsResending(false);
        return;
      }

      if (data.data?.devCode) {
        setDevCode(data.data.devCode);
      }

      setNotice(
        data.data?.sent
          ? `A new code was sent to ${email.trim()}.`
          : 'A new code was created, but email delivery is not configured in this environment.'
      );
      setIsResending(false);
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setIsResending(false);
    }
  };

  return (
    <AuthCard
      title="Verify your email"
      subtitle="Enter the 6-digit code we sent to your inbox to activate your SellSnap account."
      banner={error ? <ErrorAlert message={error} /> : undefined}
    >
      <form onSubmit={handleVerify} className={styles.form} noValidate>
        <Input
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
          error={fieldErrors.email}
          onFocus={() => setError(null)}
          placeholder="vendor@example.com"
          required
          autoComplete="email"
          containerClassName={styles.field}
        />

        <Input
          label="6-digit code"
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
            setFieldErrors((prev) => ({ ...prev, code: undefined }));
          }}
          error={fieldErrors.code}
          onFocus={() => setError(null)}
          placeholder="000000"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="one-time-code"
          className={styles.codeInput}
          containerClassName={styles.field}
        />

        {devCode && (
          <p className={styles.devCode} role="status">
            Development code: <strong>{devCode}</strong>
          </p>
        )}

        {notice && (
          <div className={styles.notice} role="status">
            <MdCheckCircle className={styles.noticeIcon} size={18} aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isLoading}
          className={styles.submitBtn}
        >
          {isLoading ? 'Verifying...' : 'Verify email'}
        </Button>
      </form>

      <div className={styles.resend}>
        <p>
          Didn&apos;t get the code?{' '}
          <button
            type="button"
            className={styles.link}
            onClick={handleResend}
            disabled={isResending}
          >
            {isResending ? 'Sending...' : 'Resend code'}
          </button>
        </p>
      </div>

      <div className={styles.footer}>
        <p>
          Already verified?{' '}
          <Link href="/auth" className={styles.link}>
            Sign in
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
