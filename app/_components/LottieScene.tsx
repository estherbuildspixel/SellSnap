'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import styles from './LottieScene.module.css';

const LottiePlayer = dynamic(() => import('./LottiePlayer'), { ssr: false });

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

type LottieSceneProps = {
  src: string;
  className?: string;
  loop?: boolean;
};

export function LottieScene({ src, className, loop = true }: LottieSceneProps) {
  const reduced = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getServerSnapshot,
  );

  return (
    <div className={cn(styles.root, className)} aria-hidden="true">
      <LottiePlayer
        src={src}
        reduced={reduced}
        loop={loop}
        className={styles.player}
      />
    </div>
  );
}
