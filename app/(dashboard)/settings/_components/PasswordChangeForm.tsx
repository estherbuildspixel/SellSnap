'use client';

import React, { useState } from 'react';
import { MdCheckCircle, MdErrorOutline } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { getPasswordError, PASSWORD_RULES } from '@/lib/password';
import { changePasswordAction } from '../_actions/password';
import styles from './PasswordChangeForm.module.css';

type FieldErrors = Partial<Record<'currentPassword' | 'newPassword' | 'confirmPassword', string>>;

const hasErrors = (errors: FieldErrors) => Object.values(errors).some(Boolean);

export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const errors: FieldErrors = {};

    if (!currentPassword) {
      errors.currentPassword = 'Enter your current password.';
    }

    const passwordError = getPasswordError(newPassword);
    if (passwordError) {
      errors.newPassword = passwordError;
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm your new password.';
    } else if (confirmPassword !== newPassword) {
      errors.confirmPassword = 'The new passwords do not match.';
    }

    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('currentPassword', currentPassword);
    formData.append('newPassword', newPassword);
    formData.append('confirmPassword', confirmPassword);

    const result = await changePasswordAction(formData);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFieldErrors({});
    setSuccessMessage('Password changed. Other devices have been signed out.');
  };

  return (
    <Card className={styles.card} variant="elevated">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Password</h2>
          <p className={styles.sectionDescription}>
            Use a strong password you do not reuse anywhere else.
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
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
            clearFieldError('currentPassword');
          }}
          error={fieldErrors.currentPassword}
          autoComplete="current-password"
          required
        />

        <Input
          label="New password"
          type="password"
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value);
            clearFieldError('newPassword');
          }}
          error={fieldErrors.newPassword}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
        />

        {newPassword.length > 0 &&
          PASSWORD_RULES.filter((rule) => !rule.isMet(newPassword))
            .slice(0, 1)
            .map((rule) => (
              <p key={rule.message} className={styles.requirement} role="status">
                {rule.message}
              </p>
            ))}

        <Input
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            clearFieldError('confirmPassword');
          }}
          error={fieldErrors.confirmPassword}
          autoComplete="new-password"
          required
        />

        <div className={styles.actions}>
          <Button type="submit" variant="primary" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Updating...' : 'Update password'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
