import type { FoodCategory, NeedLevel, StorageType, UrgencyLevel } from '../types';

interface CategoryMeta {
  label: string;
  /** Short label for dense rows. */
  short: string;
  /** 0–1: how fast the food degrades. Drives the urgency engine. */
  perishability: number;
  /** Meals recovered per kilogram. Used for impact maths. */
  mealsPerKg: number;
  /** Cold-chain requirement that best preserves it. */
  idealStorage: StorageType;
  /** Colour token name from the theme. */
  tint: string;
  hex: string;
  /** Context-specific food-safety line shown on the item dossier. */
  safety: string;
}

export const CATEGORY: Record<FoodCategory, CategoryMeta> = {
  prepared_meals: {
    label: 'Prepared meals',
    short: 'Prepared',
    perishability: 1,
    mealsPerKg: 2.4,
    idealStorage: 'refrigerated',
    tint: 'vermillion',
    hex: '#cf3f16',
    safety: 'Hot-held above 63°C or chilled below 4°C. Four-hour rule applies to cooked food.',
  },
  bakery: {
    label: 'Bakery',
    short: 'Bakery',
    perishability: 0.55,
    mealsPerKg: 2.1,
    idealStorage: 'ambient',
    tint: 'amber',
    hex: '#b07515',
    safety: 'Stales fast but stays safe at ambient. Keep dry, away from damp storage.',
  },
  produce: {
    label: 'Fresh produce',
    short: 'Produce',
    perishability: 0.7,
    mealsPerKg: 1.9,
    idealStorage: 'refrigerated',
    tint: 'moss',
    hex: '#4c5d33',
    safety: 'Chill to slow ripening. Separate ethylene producers from leafy greens.',
  },
  dairy: {
    label: 'Dairy',
    short: 'Dairy',
    perishability: 0.85,
    mealsPerKg: 2,
    idealStorage: 'refrigerated',
    tint: 'ocean',
    hex: '#1c4d5c',
    safety: 'Must stay between 1°C and 4°C in transit. Do not re-refrigerate warmed stock.',
  },
  protein: {
    label: 'Protein',
    short: 'Protein',
    perishability: 0.8,
    mealsPerKg: 2.3,
    idealStorage: 'refrigerated',
    tint: 'plum',
    hex: '#6d2f45',
    safety: 'Cold chain is critical. Record temperature at handover.',
  },
  pantry: {
    label: 'Pantry & dry goods',
    short: 'Pantry',
    perishability: 0.15,
    mealsPerKg: 3,
    idealStorage: 'ambient',
    tint: 'ink',
    hex: '#3c362a',
    safety: 'Sealed and shelf-stable. Check for pest damage and expired best-before dates.',
  },
  beverages: {
    label: 'Beverages',
    short: 'Drinks',
    perishability: 0.35,
    mealsPerKg: 1.6,
    idealStorage: 'ambient',
    tint: 'ocean',
    hex: '#1c4d5c',
    safety: 'Sealed bottles and cartons only. Chilled stock must stay below 4°C.',
  },
};

export const CATEGORY_ORDER: FoodCategory[] = [
  'prepared_meals',
  'bakery',
  'produce',
  'dairy',
  'protein',
  'pantry',
  'beverages',
];

export const STORAGE: Record<StorageType, { label: string; short: string; icon: string }> = {
  ambient: { label: 'Ambient / dry storage', short: 'Ambient', icon: 'sun' },
  refrigerated: { label: 'Refrigerated 1–4°C', short: 'Chilled', icon: 'snowflake' },
  frozen: { label: 'Frozen −18°C', short: 'Frozen', icon: 'thermometer-snowflake' },
};

export const NEED: Record<NeedLevel, { label: string; score: number; hex: string }> = {
  urgent: { label: 'Urgent', score: 100, hex: '#cf3f16' },
  high: { label: 'High', score: 80, hex: '#b07515' },
  moderate: { label: 'Moderate', score: 55, hex: '#4c5d33' },
  low: { label: 'Low', score: 30, hex: '#6d6555' },
};

export const URGENCY: Record<
  UrgencyLevel,
  { label: string; hex: string; cssVar: string; blurb: string }
> = {
  critical: {
    label: 'Critical',
    hex: '#cf3f16',
    cssVar: 'var(--color-vermillion)',
    blurb: 'Under three hours. Act now or it becomes waste.',
  },
  high: { label: 'High', hex: '#b07515', cssVar: 'var(--color-amber)', blurb: 'Same-day window closing.' },
  medium: { label: 'Medium', hex: '#4c5d33', cssVar: 'var(--color-moss)', blurb: 'Stable for now. Line up a recipient.' },
  low: { label: 'Low', hex: '#6d6555', cssVar: 'var(--color-ink-3)', blurb: 'Shelf-stable. Schedule at leisure.' },
};

export const STATUS_META: Record<
  string,
  { label: string; hex: string; note: string }
> = {
  reported: { label: 'Reported', hex: '#6d6555', note: 'Awaiting a matching decision' },
  matching: { label: 'Matching', hex: '#b07515', note: 'Recipients evaluated, awaiting confirmation' },
  matched: { label: 'Matched', hex: '#1c4d5c', note: 'Recipient confirmed, pickup not yet booked' },
  pickup_scheduled: { label: 'Pickup scheduled', hex: '#1c4d5c', note: 'Logistics booked, food still on site' },
  picked_up: { label: 'Picked up', hex: '#4c5d33', note: 'In transit to the recipient' },
  delivered: { label: 'Delivered', hex: '#4c5d33', note: 'Rescued — counted in impact' },
  expired: { label: 'Expired', hex: '#a02c0c', note: 'Window missed, recorded as waste' },
};

export const ACTIVE_STATUSES = ['reported', 'matching', 'matched', 'pickup_scheduled', 'picked_up'] as const;

/** Plain-language description of the decision still outstanding on a load. */
export const NEXT_ACTION: Record<string, string> = {
  reported: 'pick a recipient',
  matching: 'confirm a match',
  matched: 'book the pickup',
  pickup_scheduled: 'confirm collection',
  picked_up: 'confirm delivery',
  delivered: 'counted in impact',
  expired: 'recorded as waste',
};

export const PICKUP_METHODS: Record<
  string,
  { label: string; hint: string; leadTime: number }
> = {
  recipient_pickup: { label: 'Recipient collects', hint: 'Recipient sends their own vehicle or staff', leadTime: 25 },
  volunteer_driver: { label: 'Volunteer driver', hint: 'Dispatch one of the on-shift drivers', leadTime: 18 },
  donor_dropoff: { label: 'Donor delivers', hint: 'Donor runs the load over during their run', leadTime: 45 },
};
