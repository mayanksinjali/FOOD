import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Beef,
  Carrot,
  Croissant,
  CupSoda,
  Milk,
  Package,
  Snowflake,
  Sun,
  ThermometerSnowflake,
  Utensils,
} from 'lucide-react';
import type { FoodCategory, StorageType, UrgencyLevel } from '../types';
import { CATEGORY, NEED, STATUS_META, STORAGE, URGENCY } from '../lib/catalog';
import { countdown } from '../lib/format';
import type { NeedLevel } from '../types';

/* -------------------------------------------------------------------------- */
/*  Category + storage marks                                                  */
/* -------------------------------------------------------------------------- */

const CATEGORY_ICON: Record<FoodCategory, typeof Utensils> = {
  prepared_meals: Utensils,
  bakery: Croissant,
  produce: Carrot,
  dairy: Milk,
  protein: Beef,
  pantry: Package,
  beverages: CupSoda,
};

export function CategoryMark({
  category,
  size = 16,
  className = '',
}: {
  category: FoodCategory;
  size?: number;
  className?: string;
}) {
  const Icon = CATEGORY_ICON[category];
  return <Icon size={size} strokeWidth={1.9} className={className} />;
}

export function CategoryChip({ category }: { category: FoodCategory }) {
  const meta = CATEGORY[category];
  return (
    <span className="chip" style={{ color: meta.hex, borderColor: `${meta.hex}44` }}>
      <CategoryMark category={category} size={12} />
      {meta.label}
    </span>
  );
}

export function StorageChip({ storage, compact = false }: { storage: StorageType; compact?: boolean }) {
  const Icon =
    storage === 'frozen' ? ThermometerSnowflake : storage === 'refrigerated' ? Snowflake : Sun;
  return (
    <span className="chip">
      <Icon size={12} strokeWidth={2} />
      {compact ? STORAGE[storage].short : STORAGE[storage].label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Urgency                                                                   */
/* -------------------------------------------------------------------------- */

export function UrgencyTag({ level, score }: { level: UrgencyLevel; score?: number }) {
  const meta = URGENCY[level];
  return (
    <span
      className="tag"
      style={{ color: meta.hex, background: `${meta.hex}0f`, borderColor: `${meta.hex}55` }}
    >
      {level === 'critical' && <AlertTriangle size={10} strokeWidth={2.6} />}
      {meta.label}
      {score !== undefined && <span className="opacity-70">· {score}</span>}
    </span>
  );
}

export function StatusPill({ status, compact = false }: { status: string; compact?: boolean }) {
  const meta = STATUS_META[status] ?? STATUS_META.reported;
  return (
    <span
      className="tag"
      style={{ color: meta.hex, background: `${meta.hex}0d`, borderColor: `${meta.hex}44` }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: meta.hex }} />
      {compact ? meta.label.split(' ')[0] : meta.label}
    </span>
  );
}

/**
 * The pressure gauge. Filled from the left, with the four urgency thresholds
 * engraved on the track so the score never reads as a mystery number.
 */
export function UrgencyGauge({
  score,
  level,
  height = 8,
  showThresholds = true,
}: {
  score: number;
  level: UrgencyLevel;
  height?: number;
  showThresholds?: boolean;
}) {
  const meta = URGENCY[level];
  return (
    <div className="relative w-full" aria-label={`Urgency ${score} of 100`}>
      <div
        className="relative w-full overflow-hidden rounded-[2px] border border-ink/15 bg-ink/[0.06]"
        style={{ height }}
      >
        <motion.div
          className="gauge absolute inset-y-0 left-0"
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.7, ease: [0.22, 0.8, 0.2, 1] }}
          style={{ background: meta.hex }}
        />
        {showThresholds &&
          [25, 55, 80].map((t) => (
            <span
              key={t}
              className="absolute inset-y-0 w-px bg-paper/70 mix-blend-screen"
              style={{ left: `${t}%` }}
            />
          ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Countdown                                                                 */
/* -------------------------------------------------------------------------- */

export function Countdown({
  hoursRemaining,
  className = '',
  big = false,
}: {
  hoursRemaining: number;
  className?: string;
  big?: boolean;
}) {
  const expired = hoursRemaining <= 0;
  const secondsShown = hoursRemaining * 60 < 10 && !expired;
  return (
    <span
      className={`data tabular ${big ? 'text-[1.75rem] leading-none' : 'text-sm'} ${className}`}
      style={{
        color: expired ? 'var(--color-vermillion-2)' : undefined,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <motion.span
        key={secondsShown ? 'seconds' : 'minutes'}
        initial={{ opacity: 0.45 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {countdown(hoursRemaining)}
      </motion.span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Need levels                                                               */
/* -------------------------------------------------------------------------- */

export function NeedMeter({ level }: { level: NeedLevel }) {
  const meta = NEED[level];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex gap-[2px]" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-2.5 w-[3px] rounded-[1px]"
            style={{
              background: NEED[level].score / 25 > i ? meta.hex : 'rgba(22,19,12,0.16)',
            }}
          />
        ))}
      </span>
      <span className="data text-[0.68rem] uppercase tracking-wider" style={{ color: meta.hex }}>
        {meta.label}
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Misc                                                                      */
/* -------------------------------------------------------------------------- */

export function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink/10 py-2 last:border-0">
      <span className="eyebrow text-ink-3">{label}</span>
      <span className="text-right text-[0.82rem] text-ink-2">{children}</span>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 border-b border-ink/15 pb-2">
      <div>
        {eyebrow && <div className="eyebrow mb-1 text-ink-3">{eyebrow}</div>}
        <h2 className="display text-lg text-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/** Circular score readout used on recommendation cards. */
export function ScoreDial({ score, color }: { score: number; color: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[62px] w-[62px] shrink-0">
      <svg viewBox="0 0 54 54" className="h-full w-full -rotate-90">
        <circle cx="27" cy="27" r={r} fill="none" stroke="rgba(22,19,12,0.12)" strokeWidth="4" />
        <motion.circle
          cx="27"
          cy="27"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="butt"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * score) / 100 }}
          transition={{ duration: 0.9, ease: [0.22, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="display text-[1.15rem] leading-none" style={{ color }}>
          {score}
        </span>
        <span className="data text-[0.5rem] uppercase tracking-widest text-ink-3">of 100</span>
      </div>
    </div>
  );
}
