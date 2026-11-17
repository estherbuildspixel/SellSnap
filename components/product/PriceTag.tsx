import React from 'react';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/utils';
import styles from './PriceTag.module.css';

export type PriceTagProps = {
  priceInKobo: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export function PriceTag({ priceInKobo, size = 'md', className }: PriceTagProps) {
  return (
    <span className={cn(styles.price, className)} data-size={size}>
      {formatNaira(priceInKobo)}
    </span>
  );
}
