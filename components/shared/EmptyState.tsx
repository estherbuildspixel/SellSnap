import React from 'react';
import { MdInventory2 } from 'react-icons/md';
import { cn } from '@/lib/cn';
import styles from './EmptyState.module.css';

export type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon = <MdInventory2 size={40} aria-hidden="true" />,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(styles.root, className)}>
      <div className={styles.icon}>{icon}</div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
