import { z } from 'zod';
import type { ActionResult } from '@/lib/types';

export const profileSchema = z.object({
  name: z.string().trim().min(2, 'Your name must be at least 2 characters').max(80),
  businessName: z.string().trim().min(2, 'Business name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

export const codeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.'),
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: z.string().min(1, 'Enter a new password.').max(200),
  confirmPassword: z.string().min(1, 'Confirm your new password.').max(200),
});

export function rateLimitedAction(): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: 'rate_limited',
      message: 'Too many requests. Please wait a moment and try again.',
    },
  };
}

export function firstIssueMessage(
  error: z.ZodError,
  fallback = 'Please check your entries.'
): string {
  return error.issues[0]?.message || fallback;
}
