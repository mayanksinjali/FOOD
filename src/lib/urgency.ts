import type { SurplusItem, Urgency, UrgencyLevel } from '../types';
import { CATEGORY } from './catalog';

/* ==========================================================================
   Urgency engine
   --------------------------------------------------------------------------
   Deterministic and explainable. Two inputs only:

     1. Time remaining        — weighted 70%
     2. Perishability         — weighted 30%

   Hard rule: anything with under three hours remaining is Critical, no matter
   how shelf-stable it is, because the logistics window is what actually kills
   a rescue.
   ========================================================================== */

export const TIME_WEIGHT = 0.7;
export const PERISH_WEIGHT = 0.3;

const HOUR = 3600_000;

/**
 * Raw pressure from the clock alone, 0–100. Piecewise-linear, monotonic and
 * continuous at every band boundary:
 *   under 3h  82 → 100   (the logistics window is the binding constraint)
 *   3–6h      82 → 66
 *   6–12h     66 → 46
 *   12–24h    46 → 28
 *   24–48h    28 → 12
 *   beyond    12 → 0
 */
export function timePressure(hoursRemaining: number): number {
  const h = Math.max(0, hoursRemaining);
  if (h >= 0 && h < 3) return 82 + ((3 - h) / 3) * 18;
  if (h < 6) return 66 + ((6 - h) / 3) * 16;
  if (h < 12) return 46 + ((12 - h) / 6) * 20;
  if (h < 24) return 28 + ((24 - h) / 12) * 18;
  if (h < 48) return 12 + ((48 - h) / 24) * 16;
  return Math.max(0, 12 - ((h - 48) / 72) * 12);
}

export function urgencyLevel(score: number): UrgencyLevel {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

export function isResolved(item: SurplusItem): boolean {
  return item.status === 'delivered' || item.status === 'expired';
}

export function computeUrgency(item: SurplusItem, now: number): Urgency {
  const hoursRemaining = (item.expiresAt - now) / HOUR;
  const expired = item.status === 'expired' || hoursRemaining <= 0;

  const timeScore = timePressure(hoursRemaining);
  const perishScore = CATEGORY[item.category].perishability * 100;

  const timeContribution = timeScore * TIME_WEIGHT;
  const perishContribution = perishScore * PERISH_WEIGHT;

  let score = timeContribution + perishContribution;

  // Hard floor: under three hours remaining is always Critical.
  if (hoursRemaining < 3 && hoursRemaining > 0) score = Math.max(score, 80);
  score = Math.max(0, Math.min(100, score));
  if (expired) score = 100;

  const window = Math.max(1, item.expiresAt - item.reportedAt);
  const windowUsed = Math.max(0, Math.min(1, (now - item.reportedAt) / window));

  return {
    score: Math.round(score),
    level: urgencyLevel(score),
    hoursRemaining,
    timeScore,
    perishScore,
    timeWeight: TIME_WEIGHT,
    perishWeight: PERISH_WEIGHT,
    timeContribution,
    perishContribution,
    expired,
    windowUsed,
    rationale: rationaleFor(item, hoursRemaining, score),
  };
}

function rationaleFor(item: SurplusItem, hoursRemaining: number, score: number): string {
  const name = CATEGORY[item.category];
  if (hoursRemaining <= 0) {
    return `The window closed before a recipient was confirmed. ${item.quantityKg} kg of ${name.label.toLowerCase()} is now recorded as waste.`;
  }
  const pressure =
    hoursRemaining < 3
      ? 'The logistics window is the binding constraint'
      : hoursRemaining < 12
        ? 'Most recipients can still absorb this today'
        : hoursRemaining < 48
          ? 'There is room to plan this properly'
          : 'This can be scheduled at leisure';
  return `${name.label} degrades at ${Math.round(name.perishability * 100)}% perishability and has ${hoursRemaining < 1 ? 'under an hour' : `${Math.floor(hoursRemaining)}h ${Math.floor((hoursRemaining % 1) * 60)}m`} left. ${pressure}, which is why this scores ${score}/100.`;
}

/** How much of the item's life has been consumed, for the expiry bar. */
export function expiryProgress(item: SurplusItem, now: number): number {
  return Math.max(0, Math.min(1, (now - item.reportedAt) / Math.max(1, item.expiresAt - item.reportedAt)));
}
