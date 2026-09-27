import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type {
  ActivityEntry,
  AppState,
  Donor,
  Driver,
  PickupMethod,
  Recipient,
  Snapshot,
  SurplusItem,
  Toast,
  UndoStep,
  View,
} from '../types';
import { buildItems, buildLog, donors, drivers, EPOCH, recipients } from '../data/mock';
import { CATEGORY, PICKUP_METHODS } from '../lib/catalog';
import { shortTime } from '../lib/format';
import { isResolved } from '../lib/urgency';

/* ==========================================================================
   One shared state tree. Every view reads from it; nothing is faked.
   ========================================================================== */

export const CLOCK_SPEEDS = [
  { value: 1, label: '1×', hint: 'Real time' },
  { value: 60, label: '60×', hint: '1 min / sec' },
  { value: 300, label: '300×', hint: '5 min / sec' },
] as const;

export type Action =
  | { type: 'NAVIGATE'; view: View }
  | { type: 'OPEN_ITEM'; itemId: string }
  | { type: 'TICK'; delta: number }
  | { type: 'SET_SPEED'; speed: number }
  | { type: 'RUN_MATCHING'; itemId: string }
  | { type: 'CONFIRM_MATCH'; itemId: string; recipientId: string; score: number; topScore: number }
  | {
      type: 'SCHEDULE_PICKUP';
      itemId: string;
      method: PickupMethod;
      driverId?: string;
      scheduledFor: number;
      note?: string;
    }
  | { type: 'MARK_PICKED_UP'; itemId: string }
  | { type: 'MARK_DELIVERED'; itemId: string }
  | { type: 'DISMISS_TOAST'; id: string }
  | { type: 'UNDO' }
  | { type: 'OPEN_BRIEFING' }
  | { type: 'CLOSE_BRIEFING' }
  | { type: 'RESET' };

/** Actions that change the operation and can therefore be undone. */
const UNDOABLE: Action['type'][] = [
  'RUN_MATCHING',
  'CONFIRM_MATCH',
  'SCHEDULE_PICKUP',
  'MARK_PICKED_UP',
  'MARK_DELIVERED',
  'RESET',
];

let seq = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function log(state: AppState, entry: Omit<ActivityEntry, 'id'>): ActivityEntry[] {
  return [{ id: uid('log'), ...entry }, ...state.log].slice(0, 220);
}

function toast(state: AppState, t: Omit<Toast, 'id'>): Toast[] {
  return [...state.toasts, { id: uid('toast'), ...t }].slice(-4);
}

function findItem(state: AppState, itemId: string): SurplusItem | undefined {
  return state.items.find((i) => i.id === itemId);
}

function itemLabel(item: SurplusItem) {
  return CATEGORY[item.category].short.toLowerCase();
}

function snapshotOf(state: AppState): Snapshot {
  return {
    items: state.items,
    recipients: state.recipients,
    log: state.log,
    toasts: state.toasts,
  };
}

export function createInitialState(): AppState {
  return {
    donors,
    recipients: recipients.map((r) => ({ ...r })),
    drivers,
    items: buildItems(),
    log: buildLog(),
    now: EPOCH,
    epoch: EPOCH,
    clockSpeed: 1,
    view: { name: 'triage' },
    toasts: [],
    past: [],
    undoLabel: null,
    briefingOpen: true,
  };
}

/* -------------------------------------------------------------------------- */
/*  Core reducer                                                              */
/* -------------------------------------------------------------------------- */

function core(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'NAVIGATE':
      return { ...state, view: action.view };

    case 'OPEN_ITEM':
      return { ...state, view: { name: 'workflow', itemId: action.itemId }, briefingOpen: false };

    case 'SET_SPEED':
      return { ...state, clockSpeed: action.speed };

    case 'OPEN_BRIEFING':
      return { ...state, briefingOpen: true };

    case 'CLOSE_BRIEFING':
      return { ...state, briefingOpen: false };

    case 'TICK': {
      const now = state.now + action.delta;
      const expiring = state.items.filter(
        (i) => !isResolved(i) && i.status !== 'expired' && i.expiresAt <= now,
      );
      if (expiring.length === 0) return { ...state, now };

      const expiringIds = new Set(expiring.map((i) => i.id));
      let entries: ActivityEntry[] = [];
      let toasts = state.toasts;

      for (const item of expiring) {
        const donorName = state.donors.find((d) => d.id === item.donorId)?.name ?? 'the donor';
        entries = [
          {
            id: uid('log'),
            at: now,
            kind: 'expired',
            message: `${item.code} expired at ${shortTime(item.expiresAt)} before a handover was confirmed. ${Math.round(
              item.quantityKg,
            )} kg of ${itemLabel(item)} from ${donorName} recorded as waste.`,
            itemId: item.id,
            itemCode: item.code,
          },
          ...entries,
        ];
        toasts = toast({ ...state, toasts }, {
          tone: 'vermillion',
          title: `${item.code} expired`,
          detail: `${Math.round(item.quantityKg)} kg recorded as waste — no handover before the window closed.`,
        });
      }

      return {
        ...state,
        now,
        items: state.items.map((i) =>
          expiringIds.has(i.id)
            ? {
                ...i,
                status: 'expired' as const,
                expiredAt: i.expiresAt,
                expiredReason: 'The window closed while the item was still awaiting a recipient.',
              }
            : i,
        ),
        log: [...entries, ...state.log].slice(0, 220),
        toasts,
      };
    }

    case 'RUN_MATCHING': {
      const item = findItem(state, action.itemId);
      if (!item || item.status !== 'reported') return state;
      return {
        ...state,
        items: state.items.map((i) => (i.id === item.id ? { ...i, status: 'matching' } : i)),
        log: log(state, {
          at: state.now,
          kind: 'note',
          message: `${item.code} opened for matching — ${CATEGORY[item.category].label} evaluated against all recipients.`,
          itemId: item.id,
          itemCode: item.code,
        }),
      };
    }

    case 'CONFIRM_MATCH': {
      const item = findItem(state, action.itemId);
      if (!item) return state;
      const recipient = state.recipients.find((r) => r.id === action.recipientId);
      if (!recipient) return state;
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'matched',
                match: {
                  recipientId: recipient.id,
                  confirmedAt: state.now,
                  score: action.score,
                  topScore: action.topScore,
                },
              }
            : i,
        ),
        log: log(state, {
          at: state.now,
          kind: 'matched',
          message: `${item.code} ${itemLabel(item)} matched to ${recipient.organization} (${action.score}/100).${
            action.score < action.topScore
              ? ` Coordinator chose this over the top pick at ${action.topScore}/100.`
              : ''
          }`,
          itemId: item.id,
          itemCode: item.code,
        }),
        toasts: toast(state, {
          tone: 'ocean',
          title: `Matched to ${recipient.organization}`,
          detail: `${item.code} · ${action.score}/100. Next: schedule the pickup.`,
        }),
      };
    }

    case 'SCHEDULE_PICKUP': {
      const item = findItem(state, action.itemId);
      if (!item || !item.match) return state;
      const recipient = state.recipients.find((r) => r.id === item.match?.recipientId);
      const driver = action.driverId ? state.drivers.find((d) => d.id === action.driverId) : undefined;
      const methodLabel = PICKUP_METHODS[action.method].label;
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: 'pickup_scheduled',
                pickup: {
                  method: action.method,
                  driverId: action.driverId,
                  scheduledAt: state.now,
                  scheduledFor: action.scheduledFor,
                  note: action.note,
                },
              }
            : i,
        ),
        log: log(state, {
          at: state.now,
          kind: 'scheduled',
          message: `${item.code} pickup booked for ${shortTime(action.scheduledFor)} — ${methodLabel}${
            driver ? ` with ${driver.name}` : ''
          }, ${recipient?.organization ?? 'recipient'}.`,
          itemId: item.id,
          itemCode: item.code,
        }),
        toasts: toast(state, {
          tone: 'ocean',
          title: 'Pickup scheduled',
          detail: `${methodLabel}${driver ? ` · ${driver.name}` : ''} at ${shortTime(action.scheduledFor)}.`,
        }),
      };
    }

    case 'MARK_PICKED_UP': {
      const item = findItem(state, action.itemId);
      if (!item || !item.pickup) return state;
      const recipient = state.recipients.find((r) => r.id === item.match?.recipientId);
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === item.id
            ? { ...i, status: 'picked_up', pickup: { ...item.pickup!, pickedUpAt: state.now } }
            : i,
        ),
        log: log(state, {
          at: state.now,
          kind: 'picked_up',
          message: `${item.code} collected from ${
            state.donors.find((d) => d.id === item.donorId)?.name ?? 'donor'
          } — ${Math.round(item.quantityKg)} kg of ${itemLabel(item)} on the road to ${
            recipient?.organization ?? 'recipient'
          }.`,
          itemId: item.id,
          itemCode: item.code,
        }),
        toasts: toast(state, {
          tone: 'moss',
          title: 'Picked up',
          detail: `${Math.round(item.quantityKg)} kg in transit to ${recipient?.organization ?? 'recipient'}.`,
        }),
      };
    }

    case 'MARK_DELIVERED': {
      const item = findItem(state, action.itemId);
      if (!item || !item.match) return state;
      const recipient = state.recipients.find((r) => r.id === item.match?.recipientId);
      if (!recipient) return state;
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === item.id ? { ...i, status: 'delivered', deliveredAt: state.now } : i,
        ),
        // Delivered food is real intake, so recipient capacity moves.
        recipients: state.recipients.map((r) =>
          r.id === recipient.id ? { ...r, currentIntakeKg: r.currentIntakeKg + item.quantityKg } : r,
        ),
        log: log(state, {
          at: state.now,
          kind: 'delivered',
          message: `${item.code} delivered to ${recipient.organization} — ${Math.round(
            item.quantityKg,
          )} kg of ${itemLabel(item)} rescued, about ${Math.round(
            item.quantityKg * CATEGORY[item.category].mealsPerKg,
          )} meals.`,
          itemId: item.id,
          itemCode: item.code,
        }),
        toasts: toast(state, {
          tone: 'moss',
          title: 'Rescued',
          detail: `${Math.round(item.quantityKg * CATEGORY[item.category].mealsPerKg)} meals recovered with ${
            recipient.organization
          }.`,
        }),
      };
    }

    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    case 'UNDO': {
      const step = state.past[state.past.length - 1];
      if (!step) return state;
      const rest = state.past.slice(0, -1);

      let next: AppState = {
        ...state,
        past: rest,
        undoLabel: rest.length ? rest[rest.length - 1].label : null,
      };

      if (step.snap) {
        next = { ...next, ...step.snap };
      } else {
        if (step.itemId && step.itemPatch) {
          next.items = next.items.map((i) =>
            i.id === step.itemId ? { ...i, ...step.itemPatch } : i,
          );
        }
        if (step.recipientDeltaKg) {
          const { id, kg: delta } = step.recipientDeltaKg;
          next.recipients = next.recipients.map((r) =>
            r.id === id ? { ...r, currentIntakeKg: Math.max(0, r.currentIntakeKg - delta) } : r,
          );
        }
        if (step.dropLogIds?.length) {
          const drop = new Set(step.dropLogIds);
          next.log = next.log.filter((e) => !drop.has(e.id));
        }
      }

      const code = step.itemId ? state.items.find((i) => i.id === step.itemId)?.code : undefined;
      return {
        ...next,
        log: [
          {
            id: uid('log'),
            at: state.now,
            kind: 'note' as const,
            message: `Undone on the coordinator's instruction: ${step.label.toLowerCase()}. The clock was not rewound.`,
            itemId: step.itemId,
            itemCode: code,
          },
          ...next.log,
        ].slice(0, 220),
        toasts: [
          ...state.toasts,
          { id: uid('toast'), tone: 'ink' as const, title: 'Undone', detail: step.label },
        ].slice(-4),
      };
    }

    case 'RESET':
      return {
        ...createInitialState(),
        clockSpeed: state.clockSpeed,
        view: { name: 'triage' },
        briefingOpen: false,
      };

    default:
      return state;
  }
}

/** Plain-language undo labels, built from the action being applied. */
function undoLabelFor(action: Action, state: AppState): string {
  const code = (id: string) => state.items.find((i) => i.id === id)?.code ?? 'load';
  switch (action.type) {
    case 'RUN_MATCHING':
      return `Opening ${code(action.itemId)} for matching`;
    case 'CONFIRM_MATCH':
      return `Matching ${code(action.itemId)} to a recipient`;
    case 'SCHEDULE_PICKUP':
      return `Booking the pickup for ${code(action.itemId)}`;
    case 'MARK_PICKED_UP':
      return `Confirming collection of ${code(action.itemId)}`;
    case 'MARK_DELIVERED':
      return `Delivering ${code(action.itemId)}`;
    case 'RESET':
      return 'Resetting the shift';
    default:
      return 'The last action';
  }
}

/**
 * Wraps the core reducer so every operational change becomes one reversible
 * step. Navigation, clock ticks and toasts are not undoable — the clock in
 * particular must never travel backwards.
 */
export function appReducer(state: AppState, action: Action): AppState {
  const next = core(state, action);
  if (next === state) return state;
  if (!UNDOABLE.includes(action.type)) return next;

  const label = undoLabelFor(action, state);
  const itemId = 'itemId' in action ? action.itemId : undefined;
  const from = itemId ? state.items.find((i) => i.id === itemId) : undefined;

  const step: UndoStep =
    action.type === 'RESET'
      ? { label, snap: snapshotOf(state) }
      : {
          label,
          itemId,
          // Every operational action only ever writes these fields.
          itemPatch: from
            ? {
                status: from.status,
                match: from.match,
                pickup: from.pickup,
                deliveredAt: from.deliveredAt,
                expiredAt: from.expiredAt,
              }
            : undefined,
          recipientDeltaKg:
            action.type === 'MARK_DELIVERED' && from && from.match
              ? { id: from.match.recipientId, kg: from.quantityKg }
              : undefined,
          dropLogIds: next.log
            .filter((entry) => !state.log.some((s) => s.id === entry.id))
            .map((entry) => entry.id),
        };

  return { ...next, past: [...state.past, step].slice(-14), undoLabel: step.label };
}

interface StoreValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  donorById: Map<string, Donor>;
  recipientById: Map<string, Recipient>;
  driverById: Map<string, Driver>;
  itemById: Map<string, SurplusItem>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  /** Optional override, used by the render smoke tests. */
  initialState?: AppState;
}) {
  const [state, dispatch] = useReducer(appReducer, initialState, (seed) => seed ?? createInitialState());
  const speedRef = useRef(state.clockSpeed);
  speedRef.current = state.clockSpeed;

  useEffect(() => {
    const id = window.setInterval(() => {
      dispatch({ type: 'TICK', delta: 1000 * speedRef.current });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const donorById = useMemo(() => new Map(state.donors.map((d) => [d.id, d])), [state.donors]);
  const recipientById = useMemo(() => new Map(state.recipients.map((r) => [r.id, r])), [state.recipients]);
  const driverById = useMemo(() => new Map(state.drivers.map((d) => [d.id, d])), [state.drivers]);
  const itemById = useMemo(() => new Map(state.items.map((i) => [i.id, i])), [state.items]);

  const value = useMemo(
    () => ({ state, dispatch, donorById, recipientById, driverById, itemById }),
    [state, donorById, recipientById, driverById, itemById],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside AppStoreProvider');
  return ctx;
}

export function useRelay() {
  const { dispatch } = useStore();
  return useCallback((action: Action) => dispatch(action), [dispatch]);
}
