/* ==========================================================================
   Domain types for the Northgate surplus-food redistribution console.
   ========================================================================== */

export type FoodCategory =
  | 'prepared_meals'
  | 'bakery'
  | 'produce'
  | 'dairy'
  | 'protein'
  | 'pantry'
  | 'beverages';

export type StorageType = 'ambient' | 'refrigerated' | 'frozen';

export type ItemStatus =
  | 'reported'
  | 'matching'
  | 'matched'
  | 'pickup_scheduled'
  | 'picked_up'
  | 'delivered'
  | 'expired';

export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';

export type NeedLevel = 'urgent' | 'high' | 'moderate' | 'low';

export type DonorType = 'Restaurant' | 'Grocery' | 'Bakery' | 'Caterer' | 'Cafeteria';

export type RecipientType =
  | 'Shelter'
  | 'Food bank'
  | 'Community kitchen'
  | 'Community fridge'
  | 'After-school program'
  | 'Senior center'
  | 'Recovery residence';

export type PickupMethod = 'recipient_pickup' | 'volunteer_driver' | 'donor_dropoff';

export type ActivityKind =
  | 'reported'
  | 'matched'
  | 'scheduled'
  | 'picked_up'
  | 'delivered'
  | 'expired'
  | 'note';

export interface Coords {
  lat: number;
  lng: number;
}

export interface Donor {
  id: string;
  name: string;
  type: DonorType;
  neighborhood: string;
  address: string;
  coords: Coords;
  contact: string;
  phone: string;
  /** Typical surplus the site generates each week, for context. */
  weeklySurplusKg: number;
  notes: string;
}

export interface Recipient {
  id: string;
  organization: string;
  type: RecipientType;
  neighborhood: string;
  address: string;
  coords: Coords;
  /** Daily intake ceiling in kilograms. */
  capacityKgPerDay: number;
  /** Already committed / received today. */
  currentIntakeKg: number;
  acceptedStorage: StorageType[];
  acceptedCategories: FoodCategory[];
  /** Categories this site regularly takes — a stronger fit signal. */
  specialties: FoodCategory[];
  needs: Partial<Record<FoodCategory, NeedLevel>>;
  /** Local hour the intake desk opens. */
  intakeOpensHour: number;
  /** Local hour the intake desk closes for the day. */
  intakeClosesHour: number;
  /** Median minutes between offer and confirmation. */
  avgResponseMinutes: number;
  contact: string;
  phone: string;
  notes: string;
}

export interface Driver {
  id: string;
  name: string;
  vehicle: string;
  capacityKg: number;
  refrigerated: boolean;
  neighborhood: string;
  avgResponseMinutes: number;
  onShift: boolean;
}

export interface MatchRecord {
  recipientId: string;
  confirmedAt: number;
  score: number;
  /** Score of the recommendation the coordinator passed over, if any. */
  topScore?: number;
}

export interface PickupRecord {
  method: PickupMethod;
  driverId?: string;
  /** When the handover is planned for. */
  scheduledFor: number;
  /** When the coordinator booked it. */
  scheduledAt: number;
  pickedUpAt?: number;
  note?: string;
}

export interface SurplusItem {
  id: string;
  /** Manifest reference, e.g. SF-2419. */
  code: string;
  title: string;
  category: FoodCategory;
  quantityKg: number;
  /** Human packaging detail, e.g. "6 half-trays". */
  packaging: string;
  storage: StorageType;
  donorId: string;
  reportedAt: number;
  expiresAt: number;
  status: ItemStatus;
  handlingNote?: string;
  match?: MatchRecord | null;
  pickup?: PickupRecord | null;
  deliveredAt?: number;
  expiredAt?: number;
  expiredReason?: string;
}

export interface ActivityEntry {
  id: string;
  at: number;
  kind: ActivityKind;
  message: string;
  itemId?: string;
  itemCode?: string;
}

export interface Toast {
  id: string;
  title: string;
  detail?: string;
  tone: 'ink' | 'moss' | 'vermillion' | 'ocean';
}

export type ViewName = 'triage' | 'workflow' | 'recipients' | 'impact';

export interface View {
  name: ViewName;
  itemId?: string;
}

/** The mutable slice of state, snapshotted so a misclick can be undone. */
export interface Snapshot {
  items: SurplusItem[];
  recipients: Recipient[];
  log: ActivityEntry[];
  toasts: Toast[];
}

/**
 * One reversible step. Ordinary actions store a surgical patch so that undoing
 * a delivery can never resurrect an unrelated load that expired afterwards.
 * Whole-state actions (a shift reset) fall back to a full snapshot.
 */
export interface UndoStep {
  label: string;
  /** Only set for actions that replace the entire operation. */
  snap?: Snapshot;
  itemId?: string;
  itemPatch?: Partial<SurplusItem>;
  /** Intake to give back to a recipient, in kilograms. */
  recipientDeltaKg?: { id: string; kg: number };
  /** Log entries created by the action, removed again on undo. */
  dropLogIds?: string[];
}

/** One day of fictional prior performance, so the ledger has weight on load. */
export interface ImpactDay {
  /** Whole days before ops start. */
  daysAgo: number;
  kgDiverted: number;
  meals: number;
  deliveries: number;
  kgWasted: number;
}

export interface AppState extends Snapshot {
  donors: Donor[];
  drivers: Driver[];
  /** Simulated wall clock, kept in memory only. */
  now: number;
  /** Timestamp the simulation began at. */
  epoch: number;
  clockSpeed: number;
  view: View;
  /** Undo stack, newest last. The clock is deliberately not rewound. */
  past: UndoStep[];
  /** Human label for the thing undo would reverse. */
  undoLabel: string | null;
  briefingOpen: boolean;
}

/* ------------------------------- derived types --------------------------- */

export interface Urgency {
  score: number;
  level: UrgencyLevel;
  hoursRemaining: number;
  /** 0–100 contributions before weighting. */
  timeScore: number;
  perishScore: number;
  timeWeight: number;
  perishWeight: number;
  timeContribution: number;
  perishContribution: number;
  expired: boolean;
  /** Fraction of the item's original window already spent, 0–1. */
  windowUsed: number;
  rationale: string;
}

export interface ScoreBreakdown {
  need: number;
  distance: number;
  capacity: number;
  speed: number;
  compatibility: number;
}

export interface Recommendation {
  recipient: Recipient;
  score: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
  distanceKm: number;
  travelMinutes: number;
  requiredMinutes: number;
  waitMinutes: number;
  windowMinutes: number;
  availableKg: number;
  utilizationAfter: number;
}

export type DisqualificationCode = 'storage' | 'category' | 'capacity' | 'expiry' | 'window';

export interface Disqualification {
  recipient: Recipient;
  code: DisqualificationCode;
  reason: string;
  detail: string;
}

export interface MatchEvaluation {
  feasible: Recommendation[];
  disqualified: Disqualification[];
}
