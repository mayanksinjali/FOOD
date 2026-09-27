import type {
  Disqualification,
  Donor,
  MatchEvaluation,
  Recipient,
  Recommendation,
  ScoreBreakdown,
  SurplusItem,
} from '../types';
import { CATEGORY, NEED, STORAGE } from './catalog';
import { distanceKm, HANDOVER_MINUTES, travelMinutes } from './geo';
import { durationLabel, hourFloat, hourLabel } from './format';

/* ==========================================================================
   Recipient matching engine
   --------------------------------------------------------------------------
   Stage 1 — hard constraints (a recipient that fails any of these is out):
       storage compatibility · category acceptance · free capacity · can
       complete the handover before the food expires and before intake closes.

   Stage 2 — ranking of the survivors, weighted and fully explained:
       need 30% · distance 25% · capacity headroom 20% · pickup speed 15%
       · food/storage fit 10%
   ========================================================================== */

export const WEIGHTS = {
  need: 0.3,
  distance: 0.25,
  capacity: 0.2,
  speed: 0.15,
  compatibility: 0.1,
} as const;

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export interface IntakeWindow {
  isOpen: boolean;
  waitMinutes: number;
  windowMinutes: number;
}

export function intakeWindow(recipient: Recipient, now: number): IntakeWindow {
  const nowH = hourFloat(now);
  const { intakeOpensHour: open, intakeClosesHour: close } = recipient;
  const isOpen = nowH >= open && nowH < close;
  const waitMinutes = isOpen
    ? 0
    : nowH < open
      ? (open - nowH) * 60
      : (24 - nowH + open) * 60;
  const windowMinutes = isOpen ? (close - nowH) * 60 : (24 - nowH + close) * 60;
  return { isOpen, waitMinutes, windowMinutes };
}

export function needScore(recipient: Recipient, category: SurplusItem['category']): number {
  const level = recipient.needs[category];
  if (!level) return 15;
  return NEED[level].score;
}

export function distanceScore(km: number): number {
  return clamp(100 - km * 9, 4, 100);
}

export function capacityScore(item: SurplusItem, recipient: Recipient): number {
  const available = recipient.capacityKgPerDay - recipient.currentIntakeKg;
  if (available <= 0) return 0;
  return clamp(100 - (item.quantityKg / available) * 100);
}

export function speedScore(recipient: Recipient): number {
  return clamp(100 - (recipient.avgResponseMinutes - 10) * 1.1);
}

export function compatibilityScore(recipient: Recipient, item: SurplusItem): number {
  const specialty = recipient.specialties.includes(item.category);
  const accepted = recipient.acceptedCategories.includes(item.category);
  const base = specialty ? 100 : accepted ? 62 : 0;
  // A site that only handles one storage type is highly tuned to it.
  const focused = recipient.acceptedStorage.length === 1 ? 4 : 0;
  return clamp(base + focused);
}

export function availableKg(recipient: Recipient): number {
  return Math.max(0, recipient.capacityKgPerDay - recipient.currentIntakeKg);
}

/** Minutes from now until the food could realistically be delivered. */
export function requiredMinutes(
  recipient: Recipient,
  donor: Donor,
  km: number,
  waitMinutes: number,
): number {
  return waitMinutes + recipient.avgResponseMinutes + travelMinutes(km) + HANDOVER_MINUTES;
}

export function matchScore(item: SurplusItem, recipient: Recipient, km: number): {
  score: number;
  breakdown: ScoreBreakdown;
} {
  const breakdown: ScoreBreakdown = {
    need: needScore(recipient, item.category),
    distance: distanceScore(km),
    capacity: capacityScore(item, recipient),
    speed: speedScore(recipient),
    compatibility: compatibilityScore(recipient, item),
  };
  const score =
    breakdown.need * WEIGHTS.need +
    breakdown.distance * WEIGHTS.distance +
    breakdown.capacity * WEIGHTS.capacity +
    breakdown.speed * WEIGHTS.speed +
    breakdown.compatibility * WEIGHTS.compatibility;
  return { score: Math.round(clamp(score)), breakdown };
}

export function evaluateRecipients(
  item: SurplusItem,
  donor: Donor,
  recipients: Recipient[],
  now: number,
): MatchEvaluation {
  const feasible: Recommendation[] = [];
  const disqualified: Disqualification[] = [];

  const expiryMinutes = Math.max(0, (item.expiresAt - now) / 60000);
  const cat = CATEGORY[item.category];

  for (const recipient of recipients) {
    const km = distanceKm(donor.coords, recipient.coords);
    const { isOpen, waitMinutes, windowMinutes } = intakeWindow(recipient, now);
    const required = requiredMinutes(recipient, donor, km, waitMinutes);

    // ---- hard constraints ------------------------------------------------
    if (!recipient.acceptedStorage.includes(item.storage)) {
      disqualified.push({
        recipient,
        code: 'storage',
        reason: `No ${STORAGE[item.storage].short.toLowerCase()} storage on site`,
        detail: `${recipient.organization} accepts ${recipient.acceptedStorage
          .map((s) => STORAGE[s].short.toLowerCase())
          .join(' & ')} only. This load needs ${STORAGE[item.storage].label}.`,
      });
      continue;
    }

    if (!recipient.acceptedCategories.includes(item.category)) {
      disqualified.push({
        recipient,
        code: 'category',
        reason: `Does not take ${cat.short.toLowerCase()}`,
        detail: `${recipient.organization} handles ${recipient.acceptedCategories
          .map((c) => CATEGORY[c].short.toLowerCase())
          .join(', ')}. ${cat.label} is outside their intake policy.`,
      });
      continue;
    }

    const free = availableKg(recipient);
    if (free < item.quantityKg) {
      disqualified.push({
        recipient,
        code: 'capacity',
        reason: `Only ${Math.round(free)} kg of intake left today`,
        detail: `${recipient.organization} has taken ${Math.round(recipient.currentIntakeKg)} kg of its ${recipient.capacityKgPerDay} kg daily ceiling. This ${Math.round(item.quantityKg)} kg load does not fit.`,
      });
      continue;
    }

    if (required > expiryMinutes) {
      disqualified.push({
        recipient,
        code: 'expiry',
        reason: 'Cannot complete handover before expiry',
        detail: `Needs about ${durationLabel(required)} door-to-door (${recipient.avgResponseMinutes} min typical response, ${durationLabel(travelMinutes(km))} travel). Only ${durationLabel(expiryMinutes)} remain on the clock.`,
      });
      continue;
    }

    if (required > windowMinutes) {
      disqualified.push({
        recipient,
        code: 'window',
        reason: 'Intake desk closed',
        detail: `${recipient.organization} takes deliveries ${hourLabel(recipient.intakeOpensHour)}–${hourLabel(recipient.intakeClosesHour)}${
          isOpen ? ` and closes in ${durationLabel(windowMinutes)}` : `; the desk reopens in ${durationLabel(waitMinutes)}`
        }. The load would need ${durationLabel(required)}.`,
      });
      continue;
    }

    // ---- ranking ---------------------------------------------------------
    const { score, breakdown } = matchScore(item, recipient, km);
    feasible.push({
      recipient,
      score,
      breakdown,
      reasons: buildReasons(item, recipient, breakdown, km, {
        isOpen,
        waitMinutes,
        windowMinutes,
        required,
      }),
      distanceKm: km,
      travelMinutes: travelMinutes(km),
      requiredMinutes: required,
      waitMinutes,
      windowMinutes,
      availableKg: free,
      utilizationAfter: (recipient.currentIntakeKg + item.quantityKg) / recipient.capacityKgPerDay,
    });
  }

  feasible.sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);

  const order = { storage: 0, category: 1, capacity: 2, expiry: 3, window: 4 } as const;
  disqualified.sort(
    (a, b) => order[a.code] - order[b.code] || a.recipient.organization.localeCompare(b.recipient.organization),
  );

  return { feasible, disqualified };
}

function buildReasons(
  item: SurplusItem,
  recipient: Recipient,
  breakdown: ScoreBreakdown,
  km: number,
  w: IntakeWindow & { required: number },
): string[] {
  const cat = CATEGORY[item.category];
  const level = recipient.needs[item.category];
  const needLine = level
    ? `${NEED[level].label} need for ${cat.label.toLowerCase()} right now`
    : 'Steady demand, no declared shortfall';

  const free = Math.max(1, recipient.capacityKgPerDay - recipient.currentIntakeKg);
  const share = Math.round((item.quantityKg / free) * 100);
  const capacityLine =
    breakdown.capacity >= 70
      ? `${Math.round(free)} kg of daily intake free — this load uses ${share}% of it`
      : `${share}% of the ${Math.round(free)} kg left under their daily ceiling`;

  const speedLine =
    recipient.avgResponseMinutes <= 20
      ? `Confirms in ~${recipient.avgResponseMinutes} min and can receive immediately`
      : `Typically confirms in ~${recipient.avgResponseMinutes} min`;

  const storageLine = recipient.specialties.includes(item.category)
    ? `Regular ${cat.short.toLowerCase()} site with ${STORAGE[item.storage].short.toLowerCase()} storage`
    : `${STORAGE[item.storage].label} compatible`;

  const routeLine = `${km.toFixed(1)} km away · ${durationLabel(travelMinutes(km))} travel · deliverable in ${durationLabel(
    w.required,
  )}`;

  return [needLine, routeLine, capacityLine, speedLine, storageLine];
}
