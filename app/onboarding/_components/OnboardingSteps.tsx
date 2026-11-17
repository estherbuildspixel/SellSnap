'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MdArrowBack } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import styles from '../page.module.css';

const steps = [
  { title: 'Welcome to SellSnap', description: 'Sell anything in seconds with just a shareable payment link.' },
  { title: 'Create your first product', description: 'Add your product details and price to get a unique link.' },
  { title: 'Share and get paid', description: 'Share on WhatsApp or Instagram and collect payments instantly.' },
];

type OnboardingStepsProps = {
  name: string;
};

export function OnboardingSteps({ name }: OnboardingStepsProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLast = step === steps.length - 1;
  const title = step === 0 && name ? `Welcome, ${name}` : steps[step].title;

  const completeAndGo = (destination: '/products/new' | '/dashboard') => {
    setIsSubmitting(true);
    setError(null);
    void fetch('/api/onboarding/complete', { method: 'POST' })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error(data?.error?.message || 'Something went wrong');
        router.push(destination);
        router.refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setIsSubmitting(false);
      });
  };

  const handleNext = () => {
    if (!isLast) {
      setDirection('forward');
      setStep((s) => s + 1);
      return;
    }
    completeAndGo('/products/new');
  };

  const handleBack = () => {
    setError(null);
    setDirection('backward');
    setStep((s) => Math.max(0, s - 1));
  };

  const handleSkip = () => { completeAndGo('/dashboard'); };
  const progress = ((step + 1) / steps.length) * 100;

  return (
    <Card className={styles.card} variant="plain">
      <div className={styles.stepIndicator}>
        <div className={styles.stepHeader}>
          {step > 0 && (
            <button
              type="button"
              className={styles.backButton}
              onClick={handleBack}
              disabled={isSubmitting}
              aria-label="Go back to previous step"
            >
              <MdArrowBack size={20} aria-hidden="true" />
            </button>
          )}
          <span className={styles.stepText}>Step {step + 1} of {steps.length}</span>
        </div>
        <div className={styles.stepTrack}>
          <span className={styles.stepFill} style={{ width: progress + '%' }} />
        </div>
      </div>
      <div
        key={step}
        className={styles.content}
        data-direction={direction}
        aria-live="polite"
      >
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{steps[step].description}</p>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={handleSkip} disabled={isSubmitting}>Skip</Button>
        <Button type="button" variant="primary" onClick={handleNext} disabled={isSubmitting}>
          {isSubmitting ? 'Finishing...' : isLast ? 'Create your first product' : 'Next'}
        </Button>
      </div>
    </Card>
  );
}
