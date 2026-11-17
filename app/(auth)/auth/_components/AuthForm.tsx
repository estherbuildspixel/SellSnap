'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MdArrowBack, MdArrowForward, MdCheck } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getPasswordError, PASSWORD_RULES } from '@/lib/password';
import { AuthCard } from './AuthCard';
import { ErrorAlert } from './ErrorAlert';
import styles from './AuthForm.module.css';

export type AuthMode = 'login' | 'signup';

export type AuthFormProps = {
  initialMode?: AuthMode;
  initialEmail?: string;
  verified?: boolean;
};

type SignupStep = 1 | 2;

type FieldErrors = Partial<Record<'name' | 'email' | 'businessName' | 'password', string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A field is only "in error" when it holds a message. Keys mapped to undefined
 * must never be counted, or a valid form reads as invalid and silently blocks submit.
 */
const hasErrors = (errors: FieldErrors): boolean => Object.values(errors).some(Boolean);

export function AuthForm({ initialMode = 'login', initialEmail = '', verified = false }: AuthFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);

  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');

  const [step, setStep] = useState<SignupStep>(1);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Focus the first signup field only when arriving directly in signup mode
  // (e.g. from the marketing page CTA), not when switching mode in-app.
  const [autoFocusName] = useState(initialMode === 'signup');

  const isLogin = mode === 'login';

  const switchMode = (next: AuthMode) => {
    if (next === mode) return;
    setMode(next);
    setStep(1);
    setFieldErrors({});
    setError(null);
    router.replace(next === 'login' ? '/auth' : '/auth?mode=signup', { scroll: false });
  };

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  /**
   * The error banner is sticky. It has no auto-dismiss timer: it clears the
   * moment the user focuses a field, so the message stays up until they act.
   */
  const clearBannerOnFocus = () => {
    setError(null);
  };

  const validateStepOne = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!name.trim()) {
      errors.name = 'field cannot be empty';
    } else if (name.trim().length < 2) {
      errors.name = 'Please enter your full name.';
    }
    if (!email.trim()) {
      errors.email = 'field cannot be empty';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }
    return errors;
  };

  const validateStepTwo = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!businessName.trim()) {
      errors.businessName = 'field cannot be empty';
    } else if (businessName.trim().length < 2) {
      errors.businessName = 'Please enter your business or brand name.';
    }
    if (!password) {
      errors.password = 'field cannot be empty';
    } else {
      const passwordError = getPasswordError(password);
      if (passwordError) {
        errors.password = passwordError;
      }
    }
    return errors;
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errors = validateStepOne();
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setStep(2);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const loginErrors: FieldErrors = {};
    if (!email.trim()) {
      loginErrors.email = 'Field cannot be empty';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      loginErrors.email = 'Please enter a valid email address.';
    }
    if (!password) {
      loginErrors.password = 'Field cannot be empty';
    }
    setFieldErrors(loginErrors);
    if (hasErrors(loginErrors)) return;

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        if (data?.error?.code === 'email_unverified') {
          router.push(`/auth/verify-email?email=${encodeURIComponent(email.trim())}`);
          return;
        }

        setError(data?.error?.message || 'Invalid email or password. Please try again.');
        setIsLoading(false);
        return;
      }

      router.push(data.data?.redirectTo || '/dashboard');
      router.refresh();
    } catch {
      setError('An unexpected error occurred. Please try again later.');
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const stepOneErrors = validateStepOne();
    if (hasErrors(stepOneErrors)) {
      setFieldErrors(stepOneErrors);
      setStep(1);
      return;
    }

    const stepTwoErrors = validateStepTwo();
    if (hasErrors(stepTwoErrors)) {
      setFieldErrors(stepTwoErrors);
      return;
    }
    setFieldErrors({});

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, businessName, email, password }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setError(data?.error?.message || 'Could not complete registration. Please check your entries.');
        setIsLoading(false);
        return;
      }

      const params = new URLSearchParams({ email: data.data?.email || email.trim() });
      if (data.data?.devCode) {
        params.set('devCode', data.data.devCode);
      }

      router.push(`/auth/verify-email?${params.toString()}`);
      router.refresh();
    } catch {
      setError('An error occurred during sign up. Please try again.');
      setIsLoading(false);
    }
  };


  return (
    <AuthCard
      title={isLogin ? 'Welcome back' : 'Start selling in seconds'}
      subtitle={
        isLogin
          ? 'Log in to manage your products and orders'
          : step === 1
            ? 'Create your seller account and start sharing payment links'
            : 'Almost there — set up your business identity'
      }
      banner={
        <>
          {verified && !error && (
            <div className={styles.success} role="status">
              <MdCheck className={styles.successIcon} size={20} aria-hidden="true" />
              <span className={styles.successText}>
                Email verified. Sign in with your new account to continue.
              </span>
            </div>
          )}
          {error && <ErrorAlert message={error} />}
        </>
      }
    >
      {!isLogin && (
        <div className={styles.stepper} aria-label={`Step ${step} of 2`}>
          <div className={styles.stepTrack}>
            <span className={styles.stepFill} data-step={step} />
          </div>
          <span className={styles.stepText}>Step {step} of 2</span>
        </div>
      )}

      <form
        onSubmit={isLogin ? handleLogin : step === 1 ? handleContinue : handleSignup}
        className={styles.form}
        noValidate
      >
        {isLogin && (
          <>
            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError('email');
              }}
              error={fieldErrors.email}
              onFocus={clearBannerOnFocus}
              placeholder="vendor@example.com"
              required
              autoComplete="email"
              containerClassName={styles.field}
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError('password');
              }}
              error={fieldErrors.password}
              onFocus={clearBannerOnFocus}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              containerClassName={styles.field}
              labelAction={
                <Link href="/auth/forgot-password" className={styles.forgotLink}>
                  Forgot password?
                </Link>
              }
            />
          </>
        )}

        {!isLogin && step === 1 && (
          <>
            <Input
              label="Enter Full Name"
              type="text"
              value={name}
              onChange={(e) => {
                const value = e.target.value;
                setName(value);
                if (value.trim().length < 2) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    name: 'Name must be at least two characters',
                  }));
                } else {
                  clearFieldError('name');
                }
              }}
              onBlur={() => {
                if (!name.trim()) {
                  setFieldErrors((prev) => ({ ...prev, name: 'This field cannot be empty' }));
                }
              }}
              className={name.trim().length >= 2 ? styles.inputFilled : undefined}
              error={fieldErrors.name}
              onFocus={clearBannerOnFocus}
              placeholder="Chidi Obi"
              autoFocus={autoFocusName}
              autoComplete="name"
              containerClassName={styles.field}
            />

            <Input
              label="Enter Email"
              type="email"
              value={email}
              onChange={(e) => {
                const value = e.target.value;
                setEmail(value);
                if (value && !EMAIL_PATTERN.test(value.trim())) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    email: 'Enter a valid email address',
                  }));
                } else {
                  clearFieldError('email');
                }
              }}
              className={EMAIL_PATTERN.test(email.trim()) ? styles.inputFilled : undefined}
              error={fieldErrors.email}
              onFocus={clearBannerOnFocus}
              placeholder="chidi@example.com"
              autoComplete="email"
              containerClassName={styles.field}
            />
          </>
        )}

        {!isLogin && step === 2 && (
          <>
            <Input
              label="Business or brand name"
              type="text"
              value={businessName}
              onChange={(e) => {
                setBusinessName(e.target.value);
                clearFieldError('businessName');
              }}
              onBlur={() => {
                if (!businessName.trim()) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    businessName: 'This field cannot be empty',
                  }));
                }
              }}
              error={fieldErrors.businessName}
              onFocus={clearBannerOnFocus}
              className={businessName.trim() ? styles.inputFilled : undefined}
              placeholder="Chidi Luxury Wears"
              autoComplete="organization"
              containerClassName={styles.field}
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError('password');
              }}
              error={fieldErrors.password}
              onFocus={clearBannerOnFocus}
              className={password ? styles.inputFilled : undefined}
              placeholder="At least 8 characters"
              minLength={8}
              autoComplete="new-password"
              containerClassName={styles.field}
            />

            {password.length > 0 &&
              PASSWORD_RULES.filter((rule) => !rule.isMet(password))
                .slice(0, 1)
                .map((rule) => (
                  <p key={rule.message} className={styles.passwordRequirement} role="status">
                    {rule.message}
                  </p>
                ))}
          </>
        )}

        <div className={styles.actions}>
          {!isLogin && step === 2 && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={isLoading}
              onClick={() => {
                setStep(1);
                setError(null);
              }}
              className={styles.backBtn}
            >
              <MdArrowBack size={18} aria-hidden="true" />
              Back
            </Button>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isLoading}
            className={styles.submitBtn}
          >
            {isLogin
              ? isLoading
                ? 'Signing in...'
                : 'Sign in to Dashboard'
              : step === 1
                ? (
                  <>
                    Continue
                    <MdArrowForward size={20} aria-hidden="true" />
                  </>
                )
                : isLoading
                  ? 'Creating account...'
                  : 'Create Account'}
          </Button>
        </div>
      </form>

      <div className={styles.footer}>
        <p>
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" className={styles.link} onClick={() => switchMode(isLogin ? 'signup' : 'login')}>
            {isLogin ? 'Create one in 30 seconds' : 'Sign in'}
          </button>
        </p>
      </div>
    </AuthCard>
  );
}
