'use client';

import React, { useState } from 'react';
import { MdVisibility, MdVisibilityOff } from 'react-icons/md';
import { cn } from '@/lib/cn';
import styles from './Input.module.css';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
  /**
   * Rendered on the opposite end of the label row — a "Forgot password?" link,
   * for example.
   */
  labelAction?: React.ReactNode;
};

export function Input({
  id,
  label,
  labelAction,
  error,
  hint,
  className,
  containerClassName,
  disabled,
  type,
  value,
  defaultValue,
  onChange,
  ...props
}: InputProps) {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const isPassword = type === 'password';
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [hasTypedValue, setHasTypedValue] = useState(
    () => String(defaultValue ?? '').length > 0
  );
  const hasValue = value !== undefined ? String(value).length > 0 : hasTypedValue;
  const resolvedType = isPassword && passwordVisible ? 'text' : type;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setHasTypedValue(event.target.value.length > 0);
    onChange?.(event);
  };

  return (
    <div className={cn(styles.container, containerClassName)}>
      {(label || labelAction) && (
        <div className={styles.labelRow}>
          {label && (
            <label htmlFor={inputId} className={styles.label}>
              {label}
            </label>
          )}
          {labelAction}
        </div>
      )}

      <div className={styles.inputWrap}>
        <input
          id={inputId}
          type={resolvedType}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          className={cn(styles.input, isPassword && styles.inputWithToggle, className)}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          aria-invalid={Boolean(error)}
          disabled={disabled}
          {...props}
        />

        {isPassword && hasValue && (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setPasswordVisible((visible) => !visible)}
            disabled={disabled}
            aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            aria-pressed={passwordVisible}
          >
            {passwordVisible ? (
              <MdVisibilityOff size={20} aria-hidden="true" />
            ) : (
              <MdVisibility size={20} aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!error && hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
