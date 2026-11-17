'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MdCheck } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getPasswordError, PASSWORD_RULES } from '@/lib/password';
import { AuthCard } from '../../_components/AuthCard';
import { ErrorAlert } from '../../_components/ErrorAlert';
import styles from './ResetPasswordForm.module.css';

export type ResetPasswordFormProps = {
  token: string;
  /** Whether the token in the URL is still usable. */
  tokenIsValid: boolean;
};

export function ResetPasswordForm({ token, tokenIsValid }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!tokenIsValid) {
    return (
      <AuthCard
        title="This link has expired"
        subtitle="Password reset links last one hour and can only be used once."
      >
        <div className={styles.expired} role="status">
          <p className={styles.expiredText}>
            Request a fresh link and we will email you a new one.
          </p>
        </div>

        <div className={styles.footer}>
          <p>
            <Link href="/auth/forgot-password" className={styles.link}>
              Request a new link
            </Link>{' '}
            <span className={styles.separator}>·</span>{' '}
            <Link href="/auth" className={styles.link}>
              Back to sign in
            </Link>
          </p>
        </div>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password updated" subtitle="Your new password is ready to use.">
        <div className={styles.success} role="status">
          <MdCheck
            className={styles.successIcon}
            size={22}
            aria-hidden="true"
          />
          <p className={styles.successText}>
            Your password has been changed. Sign in with your new password.
          </p>
        </div>

        <div className={styles.footer}>
          <p>
            <Link href="/auth" className={styles.link}>
              Go to sign in
            </Link>
          </p>
        </div>
      </AuthCard>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errors: { password?: string; confirm?: string } = {};

    if (!password) {
      errors.password = 'Field cannot be empty';
    } else {
      const passwordError = getPasswordError(password);
      if (passwordError) {
        errors.password = passwordError;
      }
    }

    if (!confirmPassword) {
      errors.confirm = 'Field cannot be empty';
    } else if (password && confirmPassword !== password) {
      errors.confirm = 'Passwords do not match';
    }

    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setError(data?.error?.message || 'We could not update your password. Please try again.');
        setIsLoading(false);
        return;
      }

      setDone(true);
      setIsLoading(false);
    } catch {
      setError('An error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  const unmetRules = PASSWORD_RULES.filter((rule) => !rule.isMet(password));

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Pick something you have not used on SellSnap before."
      banner={error ? <ErrorAlert message={error} /> : undefined}
    >
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={fieldErrors.password}
          onFocus={() => setError(null)}
          placeholder="••••••••"
          required
          autoComplete="new-password"
          containerClassName={styles.field}
        />

        {password.length > 0 && unmetRules.length > 0 && (
          <p className={styles.requirement} role="status">
            {unmetRules[0].message}
          </p>
        )}

        <Input
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setFieldErrors((prev) => ({ ...prev, confirm: undefined }));
          }}
          error={fieldErrors.confirm}
          onFocus={() => setError(null)}
          placeholder="••••••••"
          required
          autoComplete="new-password"
          containerClassName={styles.field}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isLoading}
          className={styles.submitBtn}
        >
          {isLoading ? 'Updating...' : 'Update password'}
        </Button>
      </form>

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
