import React from 'react';
import { cn } from '@/lib/cn';
import styles from './Badge.module.css';

export type BadgeVariant = 'pending' | 'paid' | 'failed';

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  children?: React.ReactNode;
  variant: BadgeVariant;
  className?: string;
};

export function Badge({ children, variant, className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(styles.badge, className)}
      data-variant={variant}
      {...props}
    >
      {children}
    </span>
  );
}
