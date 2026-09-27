import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Info, Snowflake, Sun, ThermometerSnowflake } from 'lucide-react';
import { useStore } from '../store/AppStore';
import type { SurplusItem, Urgency, UrgencyLevel } from '../types';
import { CATEGORY, NEXT_ACTION, STORAGE, URGENCY } from '../lib/catalog';
import { countdown, durationLabel, kg, shortTime } from '../lib/format';
import { computeUrgency } from '../lib/urgency';
import { CategoryMark, StatusPill, UrgencyGauge } from '../components/primitives';

type FilterKey = 'all' | UrgencyLevel | 'inflight' | 'closed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All open' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
  { key: 'inflight', label: 'In flight' },
  { key: 'closed', label: 'Closed' },
];

const HORIZON_HOURS = 12;
const LANE_COUNT = 3;
const LANE_TOPS = [30, 56, 82];
/** Minimum horizontal gap between two marks sharing a lane. */
const LANE_GAP = 0.075;
/** Minimum horizontal gap before a second countdown label is drawn in one lane. */
const LABEL_GAP = 0.15;

export function TriageBoard() {
  const { state, dispatch, donorById } = useStore();
  const { now } = state;
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<'urgency' | 'expiry'>('urgency');

  const decorated = useMemo(
    () =>
      state.items
        .map((item) => ({ item, urgency: computeUrgency(item, now) }))
        .filter(({ urgency }) => urgency.hoursRemaining > 0 || urgency.expired),
    [state.items, now],
  );

  const open = decorated.filter(({ item }) => !['delivered', 'expired'].includes(item.status));
  const closed = decorated.filter(({ item }) => ['delivered', 'expired'].includes(item.status));

  const counts = useMemo(() => {
    const c: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, inflight: 0 };
    for (const { item, urgency } of open) {
      c[urgency.level] += 1;
      if (['matched', 'pickup_scheduled', 'picked_up'].includes(item.status)) c.inflight += 1;
    }
    return c;
  }, [open]);

  const visible = useMemo(() => {
    const list =
      filter === 'closed'
        ? closed
        : filter === 'all'
          ? open
          : filter === 'inflight'
            ? open.filter(({ item }) => ['matched', 'pickup_scheduled', 'picked_up'].includes(item.status))
            : open.filter(({ urgency }) => urgency.level === filter);

    return [...list].sort((a, b) =>
      sort === 'urgency'
        ? b.urgency.score - a.urgency.score
        : a.item.expiresAt - b.item.expiresAt,
    );
  }, [filter, open, closed, sort]);

  const horizon = open.filter(({ item }) => (item.expiresAt - now) / 3600_000 <= HORIZON_HOURS);
  const beyond = open.length - horizon.length;
  const failing = open.filter(({ item, urgency }) => urgency.hoursRemaining < 3);
  const wastedKg = closed
    .filter(({ item }) => item.status === 'expired')
    .reduce((sum, { item }) => sum + item.quantityKg, 0);

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* ------------------------------ masthead --------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 0.8, 0.2, 1] }}
      >
        <div className="eyebrow text-ink-3">Triage · live surplus manifest</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <h1 className="display max-w-[18ch] text-[2.35rem] leading-[0.95] sm:text-[3.1rem]">
              What needs a decision
              <span className="text-vermillion">.</span>
            </h1>
            <p className="mt-3 max-w-[46ch] text-[0.82rem] leading-relaxed text-ink-2">
              Each row below is one load of edible food sitting at a donor. Click any row to work it all
              the way through — judge the urgency, choose a recipient, book the pickup, mark it delivered.
            </p>
          </div>
          <div className="flex items-end gap-6 pb-1">
            <Stat label="Open loads" value={String(open.length)} />
            <Stat
              label="At risk"
              value={String(failing.length)}
              tone={failing.length ? 'var(--color-vermillion)' : undefined}
            />
            <Stat label="Wasted today" value={kg(wastedKg)} tone="var(--color-ink-3)" />
          </div>
        </div>
      </motion.div>

      {failing.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.4 }}
          className="mt-5 flex items-start gap-3 rounded-[3px] border border-vermillion/40 bg-vermillion/[0.07] px-4 py-3"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-vermillion" strokeWidth={2.4} />
          <p className="text-[0.82rem] leading-relaxed text-ink-2">
            <span className="font-semibold text-vermillion">
              {failing.length} {failing.length === 1 ? 'load is' : 'loads are'} inside the three-hour
            </span>{' '}
            window:{' '}
            {failing
              .map(({ item }) => `${item.code} (${countdown((item.expiresAt - now) / 3600_000)} left)`)
              .join(', ')}
            . Anything unresolved at expiry is recorded as waste.
          </p>
        </motion.div>
      )}

      {/* ------------------------- expiry horizon rail --------------------- */}
      <HorizonRail
        entries={horizon}
        now={now}
        beyond={beyond}
        onSelect={(id) => dispatch({ type: 'OPEN_ITEM', itemId: id })}
      />

      {/* ----------------------------- controls ---------------------------- */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const n =
              f.key === 'all'
                ? open.length
                : f.key === 'closed'
                  ? closed.length
                  : f.key === 'inflight'
                    ? counts.inflight
                    : counts[f.key];
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`relative rounded-[3px] border px-3 py-1.5 text-[0.72rem] font-semibold tracking-tight transition-colors ${
                  active
                    ? 'border-ink bg-ink text-paper'
                    : 'border-ink/20 text-ink-2 hover:border-ink/45 hover:bg-paper/60'
                }`}
              >
                {f.label}
                <span className={`data ml-1.5 text-[0.65rem] ${active ? 'text-paper/60' : 'text-ink-3'}`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="eyebrow text-ink-3">Order</span>
          <div className="flex rounded-[3px] border border-ink/20 p-[2px]">
            {(['urgency', 'expiry'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`rounded-[2px] px-2.5 py-1 text-[0.7rem] font-semibold capitalize transition-colors ${
                  sort === s ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------ manifest --------------------------- */}
      <div className="mt-4 border-t border-ink/20">
        <div className="hidden grid-cols-[2.4rem_1fr_9rem_9.5rem] gap-4 border-b border-ink/15 py-2 md:grid">
          {['Rank', 'Load', 'Time left', 'Where it is'].map((h) => (
            <span key={h} className="eyebrow text-ink-3">
              {h}
            </span>
          ))}
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {visible.map(({ item, urgency }, index) => {
            const donor = donorById.get(item.donorId);
            return (
              <motion.button
                layout
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.34, delay: Math.min(index * 0.03, 0.24), ease: [0.22, 0.8, 0.2, 1] }}
                onClick={() => dispatch({ type: 'OPEN_ITEM', itemId: item.id })}
                className="group relative block w-full border-b border-ink/12 px-3 py-3.5 text-left transition-colors hover:bg-ink/[0.035]"
              >
                <span
                  className="absolute left-0 top-0 h-full w-[3px] origin-top scale-y-0 transition-transform duration-200 group-hover:scale-y-100"
                  style={{ background: URGENCY[urgency.level].hex }}
                />
                <div className="grid grid-cols-[2.4rem_1fr] items-start gap-4 md:grid-cols-[2.4rem_1fr_9rem_9.5rem]">
                  <span className="data pt-0.5 text-[0.7rem] text-ink-3">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="display text-[1.12rem] leading-tight text-ink">{item.title}</h3>
                      {urgency.level === 'critical' && item.status === 'reported' && (
                        <span className="tag" style={{ color: 'var(--color-vermillion)', borderColor: 'rgba(207,63,22,0.4)' }}>
                          act now
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.74rem] text-ink-3">
                      <span className="inline-flex items-center gap-1.5" style={{ color: CATEGORY[item.category].hex }}>
                        <CategoryMark category={item.category} size={13} />
                        {CATEGORY[item.category].label}
                      </span>
                      <span className="data">{kg(item.quantityKg)}</span>
                      <span className="hidden sm:inline">{donor?.name}</span>
                      <span className="hidden items-center gap-1 lg:inline-flex">
                        {item.storage === 'frozen' ? (
                          <ThermometerSnowflake size={12} />
                        ) : item.storage === 'refrigerated' ? (
                          <Snowflake size={12} />
                        ) : (
                          <Sun size={12} />
                        )}
                        {STORAGE[item.storage].short}
                      </span>
                      <span className="data text-ink-4">{item.code}</span>
                    </div>

                    <div className="mt-2.5 flex items-center gap-3 md:hidden">
                      <UrgencyGauge score={urgency.score} level={urgency.level} height={6} showThresholds={false} />
                      <span className="data shrink-0 text-[0.8rem]" style={{ color: URGENCY[urgency.level].hex }}>
                        {countdown(urgency.hoursRemaining)}
                      </span>
                    </div>
                  </div>

                  <div className="hidden md:block">
                    <div
                      className="data text-[0.95rem] leading-none"
                      style={{ color: urgency.level === 'critical' ? 'var(--color-vermillion)' : undefined }}
                    >
                      {countdown(urgency.hoursRemaining)}
                    </div>
                    <div className="mt-2">
                      <UrgencyGauge score={urgency.score} level={urgency.level} height={6} showThresholds={false} />
                    </div>
                    <div className="data mt-1 text-[0.62rem] uppercase tracking-wider text-ink-4">
                      urgency {urgency.score}
                    </div>
                  </div>

                  <div className="hidden flex-col items-start gap-1.5 md:flex">
                    <StatusPill status={item.status} compact />
                    <span className="inline-flex items-center gap-1 text-[0.68rem] text-ink-3 transition-colors group-hover:text-ink">
                      Next: {NEXT_ACTION[item.status]}
                      <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>

        {visible.length === 0 && (
          <div className="py-14 text-center">
            <p className="display text-lg text-ink-3">Nothing in this bucket.</p>
            <p className="mt-1 text-[0.8rem] text-ink-4">Switch the filter to see the rest of the manifest.</p>
          </div>
        )}
      </div>

      {filter === 'closed' && closed.length > 0 && (
        <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-3">
          Closed loads are kept honestly: {closed.filter(({ item }) => item.status === 'delivered').length} rescued,{' '}
          {closed.filter(({ item }) => item.status === 'expired').length} lost. Nothing is removed from the ledger.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="eyebrow text-ink-3">{label}</div>
      <div className="data mt-1 text-[1.35rem] leading-none" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  The 12-hour expiry horizon                                                */
/* -------------------------------------------------------------------------- */

function HorizonRail({
  entries,
  now,
  beyond,
  onSelect,
}: {
  entries: { item: SurplusItem; urgency: Urgency }[];
  now: number;
  beyond: number;
  onSelect: (id: string) => void;
}) {
  const lanes = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.item.expiresAt - b.item.expiresAt);
    const laneLast = [-1, -1, -1];
    const labelLast = [-1, -1, -1];
    let previous = 0;

    return sorted.map((entry) => {
      const t = Math.max(0, Math.min(1, (entry.item.expiresAt - now) / (HORIZON_HOURS * 3600_000)));
      // First lane whose previous mark is far enough away, else rotate on.
      let lane = laneLast.findIndex((last) => t - last >= LANE_GAP);
      if (lane === -1) {
        lane = (previous + 1) % LANE_COUNT;
      }
      laneLast[lane] = t;
      previous = lane;

      const roomForLabel = t - labelLast[lane] >= LABEL_GAP;
      if (roomForLabel) labelLast[lane] = t;

      return { ...entry, t, lane, roomForLabel };
    });
  }, [entries, now]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.14, duration: 0.5, ease: [0.22, 0.8, 0.2, 1] }}
      className="sheet mt-6 rounded-[3px] px-4 pb-3 pt-3 sm:px-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="eyebrow text-ink-3">Expiry horizon · next {HORIZON_HOURS} hours</span>
        <span className="data text-[0.62rem] text-ink-4">
          {beyond > 0 ? `+${beyond} load${beyond > 1 ? 's' : ''} beyond the horizon` : 'all open loads inside the horizon'}
        </span>
      </div>
      <p className="mt-1.5 flex items-start gap-1.5 text-[0.74rem] leading-snug text-ink-3">
        <Info size={11} className="mt-[3px] shrink-0 text-ink-4" />
        One mark per open load, placed at the moment it expires. The left edge is now and every tick is an
        hour — so the further left a mark sits, the less time you have.
      </p>

      <div className="relative mt-3 h-[118px]">
        {/* hour grid + labels */}
        <div className="absolute inset-x-0 bottom-0 top-0">
          {Array.from({ length: HORIZON_HOURS + 1 }).map((_, i) => {
            const left = (i / HORIZON_HOURS) * 100;
            return (
              <div key={i} className="absolute inset-y-0" style={{ left: `${left}%` }}>
                <div className="h-full w-px bg-ink/10" />
                <span
                  className={`data absolute bottom-0 left-1 whitespace-nowrap text-[0.58rem] text-ink-4 ${
                    i % 2 === 0 ? '' : 'hidden sm:block'
                  }`}
                >
                  {shortTime(now + i * 3600_000)}
                </span>
              </div>
            );
          })}
        </div>

        {/* the rail bed, with 'now' pinned to its left edge */}
        <div className="absolute inset-x-0 top-[8px] h-[10px] rounded-[2px] border border-ink/12 bg-ink/[0.045]" />
        <span className="absolute left-0 top-[5px] h-[16px] w-[2px] bg-vermillion" />

        {lanes.map(({ item, urgency, t, lane, roomForLabel }) => {
          const laneTop = LANE_TOPS[lane];
          const color = URGENCY[urgency.level].hex;
          return (
            <div key={item.id} className="absolute" style={{ left: `${t * 100}%` }}>
              <span
                className="absolute left-0 w-px bg-ink/20"
                style={{ top: 18, height: laneTop - 18 }}
              />
              <button
                onClick={() => onSelect(item.id)}
                title={`${item.code} · ${item.title} · ${countdown(urgency.hoursRemaining)} left`}
                className="group absolute z-20 -translate-x-1/2"
                style={{ top: laneTop }}
              >
                <span
                  className="block h-[24px] w-[3px] rounded-full transition-transform duration-200 group-hover:scale-y-110"
                  style={{ background: color }}
                />
                {roomForLabel && (
                  <span
                    className="data absolute left-[7px] top-1/2 -translate-y-1/2 whitespace-nowrap text-[0.56rem] opacity-80 transition-opacity group-hover:opacity-100"
                    style={{ color }}
                  >
                    {countdown(urgency.hoursRemaining)}
                  </span>
                )}
                <span
                  className={`pointer-events-none absolute top-[30px] z-30 hidden w-[15rem] rounded-[3px] border border-ink/20 bg-paper px-3 py-2 text-left shadow-[0_18px_40px_-22px_rgba(22,19,12,0.9)] group-hover:block ${
                    t > 0.68 ? 'right-0' : t < 0.2 ? 'left-0' : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  <span className="display block text-[0.95rem] leading-tight">{item.title}</span>
                  <span className="data mt-1 block text-[0.62rem] text-ink-3">
                    {item.code} · {kg(item.quantityKg)} · {durationLabel(urgency.hoursRemaining * 60)} left
                  </span>
                  <span className="data mt-0.5 block text-[0.6rem] text-ink-4">click to work this load</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
