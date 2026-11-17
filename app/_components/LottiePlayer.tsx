'use client';

import { Lottie, type LottieHandle } from 'lottie-react';
import { useCallback, useEffect, useRef } from 'react';

type LottiePlayerProps = {
  src: string;
  reduced: boolean;
  loop: boolean;
  className?: string;
};

export default function LottiePlayer({
  src,
  reduced,
  loop,
  className,
}: LottiePlayerProps) {
  const containerRef = useRef<HTMLElement>(null);
  const handle = useRef<LottieHandle>(null);
  const visible = useRef(false);
  const completed = useRef(false);

  const update = useCallback(() => {
    const animation = handle.current;
    if (!animation) return;

    if (reduced) {
      animation.pause();
      animation.seek({ percent: 100 });
      return;
    }

    if (!visible.current) {
      animation.pause();
      return;
    }

    if (!loop && completed.current) {
      completed.current = false;
      animation.seek({ percent: 0 });
    }

    animation.play();
  }, [loop, reduced]);

  const onReady = useCallback(() => {
    update();
  }, [update]);

  const onComplete = useCallback(() => {
    completed.current = true;
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry.isIntersecting;
        update();
      },
      { threshold: 0.25 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [update]);

  return (
    <Lottie
      ref={containerRef}
      src={src}
      loop={loop && !reduced}
      autoplay={false}
      lottieRef={handle}
      subscriptions={{ ready: onReady, complete: onComplete }}
      className={className}
    />
  );
}
