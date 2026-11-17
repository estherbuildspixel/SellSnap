import React from 'react';
import { cn } from '@/lib/cn';
import styles from './Card.module.css';

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  children?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'outlined' | 'plain';
};

export function Card({
  children,
  className,
  variant = 'default',
  ...props
}: CardProps) {
  return (
    <div
      className={cn(styles.card, className)}
      data-variant={variant}
      {...props}
    >
      {children}
    </div>
  );
}
