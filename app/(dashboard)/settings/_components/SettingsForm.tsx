'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MdCheckCircle, MdErrorOutline } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import {
  resendEmailChangeCodeAction,
  verifyEmailChangeAction,
} from '../_actions/email-change';
import { updateProfileAction } from '../_actions/profile';
import styles from './SettingsForm.module.css';

export type SettingsFormProps = {
  initialValues: {
    name: string;
    businessName: string;
    email: string;
    pendingEmail: string | null;
  };
};

export function SettingsForm({ initialValues }: SettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues.name);
  const [businessName, setBusinessName] = useState(initialValues.businessName);
  const [email, setEmail] = useState(initialValues.email);
  const [pendingEmail, setPendingEmail] = useState(initialValues.pendingEmail);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setVerifyError(null);
    setVerifyNotice(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('name', name);
    formData.append('businessName', businessName);
    formData.append('email', email);

    const result = await updateProfileAction(formData);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setName(result.data.name);
    setBusinessName(result.data.businessName);
    setEmail(result.data.email);
    setPendingEmail(result.data.pendingEmail);

    if (result.data.emailChanged) {
      setCode('');
      setDevCode(result.data.devCode);
      setVerifyNotice(
        result.data.emailSent
          ? `We sent a 6-digit code to ${result.data.pendingEmail}. Your current email stays active until it is verified.`
          : 'A verification code was created, but email delivery is not configured in this environment.'
      );
      router.refresh();
      return;
    }

    setSuccessMessage('Your settings have been saved.');
    router.refresh();
  };

  const handleVerifyEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setVerifyError(null);
    setVerifyNotice(null);

    if (!/^\d{6}$/.test(code)) {
      setVerifyError('Enter the 6-digit code from your email.');
      return;
    }

    setIsVerifying(true);

    const formData = new FormData();
    formData.append('code', code);

    const result = await verifyEmailChangeAction(formData);
    setIsVerifying(false);

    if (!result.ok) {
      setVerifyError(result.error.message);
      return;
    }

    setEmail(result.data.email);
    setPendingEmail(null);
    setCode('');
    setDevCode(undefined);
    setSuccessMessage('Your email address has been updated.');
    router.refresh();
  };

  const handleResendEmail = async () => {
    setVerifyError(null);
    setVerifyNotice(null);
    setIsResending(true);

    const result = await resendEmailChangeCodeAction();
    setIsResending(false);

    if (!result.ok) {
      setVerifyError(result.error.message);
      return;
    }

    setDevCode(result.data.devCode);
    setVerifyNotice(
      result.data.sent
        ? `A new code was sent to ${pendingEmail}.`
        : 'A new code was created, but email delivery is not configured in this environment.'
    );
  };

  return (
    <Card className={styles.card} variant="elevated">
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Profile &amp; business</h2>
          <p className={styles.sectionDescription}>
            This information appears on your dashboard and product links.
          </p>
        </div>

        {error && (
          <div className={styles.alert} data-tone="error" role="alert">
            <MdErrorOutline size={20} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className={styles.alert} data-tone="success" role="status">
            <MdCheckCircle size={20} aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
        )}

        <Input
          label="Full name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          required
        />

        <Input
          label="Business name"
          type="text"
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          autoComplete="organization"
          required
        />

        <Input
          label="Email address"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          hint="Changing your email requires a 6-digit verification code. Buyers will not see this address."
          required
        />

        <div className={styles.actions}>
          <Button type="submit" variant="primary" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </form>

      {pendingEmail && (
        <form className={styles.verification} onSubmit={handleVerifyEmail}>
          <div className={styles.verificationHeader}>
            <div>
              <h3 className={styles.verificationTitle}>Confirm your new email</h3>
              <p className={styles.verificationText}>
                Enter the code sent to <strong>{pendingEmail}</strong>. Your current email remains
                active until the new one is verified.
              </p>
            </div>
            <button
              type="button"
              className={styles.resendBtn}
              onClick={handleResendEmail}
              disabled={isResending}
            >
              {isResending ? 'Sending...' : 'Resend code'}
            </button>
          </div>

          {verifyError && (
            <div className={styles.alert} data-tone="error" role="alert">
              <MdErrorOutline size={20} aria-hidden="true" />
              <span>{verifyError}</span>
            </div>
          )}

          {verifyNotice && (
            <div className={styles.alert} data-tone="success" role="status">
              <MdCheckCircle size={20} aria-hidden="true" />
              <span>{verifyNotice}</span>
            </div>
          )}

          {devCode && (
            <p className={styles.devCode}>
              Development code: <strong>{devCode}</strong>
            </p>
          )}

          <Input
            label="6-digit code"
            type="text"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
              setVerifyError(null);
            }}
            placeholder="000000"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            className={styles.codeInput}
            required
          />

          <div className={styles.actions}>
            <Button type="submit" variant="primary" size="lg" disabled={isVerifying}>
              {isVerifying ? 'Verifying...' : 'Verify email'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
