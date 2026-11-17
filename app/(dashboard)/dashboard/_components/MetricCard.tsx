import React from 'react';
import {
  MdArrowDownward,
  MdArrowUpward,
  MdTrendingFlat,
} from 'react-icons/md';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import styles from './MetricCard.module.css';

export type MetricTrendDirection = 'up' | 'down' | 'flat';

export type MetricCardProps = {
  label: string;
  value: string;
  caption: string;
  direction: MetricTrendDirection;
  changePercent: number;
  comparisonLabel: string;
  series: number[];
  className?: string;
};

const TREND_ICON: Record<MetricTrendDirection, React.ReactNode> = {
  up: <MdArrowUpward size={16} aria-hidden="true" />,
  down: <MdArrowDownward size={16} aria-hidden="true" />,
  flat: <MdTrendingFlat size={16} aria-hidden="true" />,
};

const TREND_WORD: Record<MetricTrendDirection, string> = {
  up: 'increase',
  down: 'decrease',
  flat: 'no change',
};

const SPARKLINE_WIDTH = 120;
const SPARKLINE_HEIGHT = 40;
const SPARKLINE_PAD_X = 2;
const SPARKLINE_PAD_Y = 4;

function Sparkline({
  series,
  direction,
}: {
  series: number[];
  direction: MetricTrendDirection;
}) {
  const max = Math.max(...series);
  const min = Math.min(...series, 0);
  const range = max - min;
  const step =
    series.length > 1
      ? (SPARKLINE_WIDTH - SPARKLINE_PAD_X * 2) / (series.length - 1)
      : 0;

  const points = series.map((value, index) => {
    const x = SPARKLINE_PAD_X + index * step;
    const y =
      range === 0
        ? SPARKLINE_HEIGHT / 2
        : SPARKLINE_HEIGHT -
          SPARKLINE_PAD_Y -
          ((value - min) / range) * (SPARKLINE_HEIGHT - SPARKLINE_PAD_Y * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const linePoints = points.join(' ');
  const areaPoints = `${SPARKLINE_PAD_X},${SPARKLINE_HEIGHT} ${linePoints} ${
    SPARKLINE_WIDTH - SPARKLINE_PAD_X
  },${SPARKLINE_HEIGHT}`;

  return (
    <svg
      className={styles.sparkline}
      data-direction={direction}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <polygon className={styles.sparklineArea} points={areaPoints} />
      <polyline
        className={styles.sparklineLine}
        points={linePoints}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function MetricCard({
  label,
  value,
  caption,
  direction,
  changePercent,
  comparisonLabel,
  series,
  className,
}: MetricCardProps) {
  const percentLabel = `${changePercent.toFixed(1)}%`;
  const trendDescription = `${TREND_WORD[direction]} of ${percentLabel} ${comparisonLabel}`;

  return (
    <Card className={cn(styles.card, className)}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={styles.trend} data-direction={direction}>
          <span className={styles.trendGlyph} aria-hidden="true">
            {TREND_ICON[direction]}
          </span>
          <span aria-hidden="true">{percentLabel}</span>
          <span className={styles.srOnly}>{trendDescription}</span>
        </span>
      </div>

      <div className={styles.body}>
        <span className={styles.value}>{value}</span>
        <span className={styles.caption}>{caption}</span>
      </div>

      <div className={styles.footer}>
        <Sparkline series={series} direction={direction} />
        <span className={styles.comparison}>{comparisonLabel}</span>
      </div>
    </Card>
  );
}
