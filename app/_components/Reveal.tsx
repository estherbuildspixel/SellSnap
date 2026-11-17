'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import styles from './Reveal.module.css';

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
};

type RevealVisibility = 'pending' | 'visible' | 'hidden';

export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visibility, setVisibility] = useState<RevealVisibility>('pending');

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setVisibility(entry.isIntersecting ? 'visible' : 'hidden');
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const isReady = visibility !== 'pending';

  return (
    <div
      ref={ref}
      className={cn(
        isReady && styles.ready,
        visibility === 'visible' && styles.visible,
        className
      )}
      style={delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
