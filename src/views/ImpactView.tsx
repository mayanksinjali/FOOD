import { motion } from 'framer-motion';
import { Activity, ArrowRight, Leaf, Scale, TrendingUp, TriangleAlert, Utensils } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { impactHistory, EPOCH } from '../data/mock';
import { CATEGORY, CATEGORY_ORDER } from '../lib/catalog';
import { kg, meals as fmtMeals, relativeShort, shortTime } from '../lib/format';
import { useCountUp } from '../lib/hooks';
import { CategoryMark, SectionHeading } from '../components/primitives';

const KIND_COLOR: Record<string, string> = {
  reported: 'var(--color-ink-3)',
  matched: 'var(--color-ocean)',
  scheduled: 'var(--color-ocean)',
  picked_up: 'var(--color-moss)',
  delivered: 'var(--color-moss)',
  expired: 'var(--color-vermillion)',
  note: 'var(--color-ink-3)',
};

export function ImpactView() {
  const { state, dispatch, recipientById } = useStore();

  const delivered = state.items.filter((i) => i.status === 'delivered');
  const expired = state.items.filter((i) => i.status === 'expired');
  const active = state.items.filter((i) =>
    ['matching', 'matched', 'pickup_scheduled', 'picked_up'].includes(i.status),
  );

  const deliveredKg = delivered.reduce((s, i) => s + i.quantityKg, 0);
  const wastedKg = expired.reduce((s, i) => s + i.quantityKg, 0);
  const mealsSaved = delivered.reduce((s, i) => s + i.quantityKg * CATEGORY[i.category].mealsPerKg, 0);
  const mealsLost = expired.reduce((s, i) => s + i.quantityKg * CATEGORY[i.category].mealsPerKg, 0);
  const rescueRate = deliveredKg + wastedKg > 0 ? deliveredKg / (deliveredKg + wastedKg) : 0;

  const byCategory = CATEGORY_ORDER.map((category) => ({
    category,
    kg: delivered.filter((i) => i.category === category).reduce((s, i) => s + i.quantityKg, 0),
  })).filter((row) => row.kg > 0);
  const maxCategoryKg = Math.max(1, ...byCategory.map((r) => r.kg));

  const byRecipient = state.recipients
    .map((r) => ({
      recipient: r,
      kg: delivered.filter((i) => i.match?.recipientId === r.id).reduce((s, i) => s + i.quantityKg, 0),
      loads: delivered.filter((i) => i.match?.recipientId === r.id).length,
    }))
    .filter((r) => r.kg > 0)
    .sort((a, b) => b.kg - a.kg);

  const mealsAnimated = useCountUp(mealsSaved);
  const kgAnimated = useCountUp(deliveredKg);
  const wastedAnimated = useCountUp(wastedKg);
  const rateAnimated = useCountUp(rescueRate * 100);

  return (
    <div className="mx-auto max-w-[1180px]">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <div className="eyebrow text-ink-3">Impact ledger · this session</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <h1 className="display max-w-[20ch] text-[2.35rem] leading-[0.95] sm:text-[3.1rem]">
            Food that became dinner
            <span className="text-vermillion">.</span>
          </h1>
          <p className="max-w-[34ch] pb-1 text-[0.78rem] leading-relaxed text-ink-3">
            Numbers move the moment a delivery is marked complete — and stay honest when a window closes
            without a recipient.
          </p>
        </div>
      </motion.div>

      {/* -------------------------- hero counters -------------------------- */}
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink/15 pb-2">
        <span className="eyebrow text-ink-3">Live · totals for this shift</span>
        <span className="text-[0.72rem] text-ink-3">
          these four figures only move when you complete a delivery
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Hero
          eyebrow="Meals recovered"
          value={fmtMeals(mealsAnimated)}
          icon={<Utensils size={15} />}
          tone="var(--color-moss)"
          delay={0}
        />
        <Hero
          eyebrow="Kilograms diverted"
          value={kg(kgAnimated)}
          icon={<Scale size={15} />}
          tone="var(--color-ocean)"
          delay={0.06}
        />
        <Hero
          eyebrow="Deliveries completed"
          value={String(delivered.length)}
          icon={<TrendingUp size={15} />}
          tone="var(--color-ink)"
          delay={0.12}
        />
        <Hero
          eyebrow="Active redistributions"
          value={String(active.length)}
          icon={<Activity size={15} />}
          tone="var(--color-amber)"
          delay={0.18}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <WeekChart todayKg={deliveredKg} todayWastedKg={wastedKg} />

          {/* ---------------------- rescue rate + categories ---------------- */}
          <section className="sheet rounded-[3px] p-5">
            <SectionHeading eyebrow="Rescue rate · this shift" title="What arrived versus what was lost" />
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <div className="data text-[2.6rem] leading-none text-moss">{Math.round(rateAnimated)}%</div>
                <div className="eyebrow mt-1 text-ink-3">of tracked weight rescued</div>
              </div>
              <div className="min-w-[12rem] flex-1">
                <div className="flex h-[18px] w-full overflow-hidden rounded-[2px] border border-ink/15">
                  <motion.div
                    className="h-full bg-moss"
                    initial={{ width: 0 }}
                    animate={{ width: `${rescueRate * 100}%` }}
                    transition={{ duration: 0.8, ease: [0.22, 0.8, 0.2, 1] }}
                  />
                  <div className="hatch h-full flex-1 opacity-70" style={{ color: 'var(--color-vermillion)' }} />
                </div>
                <div className="data mt-1.5 flex justify-between text-[0.65rem] text-ink-3">
                  <span className="text-moss">{kg(deliveredKg)} delivered</span>
                  <span className="text-vermillion-2">{kg(wastedKg)} wasted</span>
                </div>
              </div>
            </div>
          </section>

          <section className="sheet rounded-[3px] p-5">
            <SectionHeading eyebrow="Recovered by category · this shift" title="Where the weight came from" />
            {byCategory.length === 0 ? (
              <p className="text-[0.82rem] text-ink-3">Nothing delivered yet this session.</p>
            ) : (
              <ul className="space-y-3">
                {byCategory.map((row, i) => (
                  <li key={row.category}>
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className="inline-flex items-center gap-2 text-[0.78rem]"
                        style={{ color: CATEGORY[row.category].hex }}
                      >
                        <CategoryMark category={row.category} size={14} />
                        {CATEGORY[row.category].label}
                      </span>
                      <span className="data text-[0.75rem] text-ink-2">
                        {kg(row.kg)}{' '}
                        <span className="text-ink-4">
                          · {fmtMeals(row.kg * CATEGORY[row.category].mealsPerKg)} meals
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 h-[6px] w-full rounded-[2px] bg-ink/[0.07]">
                      <motion.div
                        className="h-full rounded-[2px]"
                        style={{ background: CATEGORY[row.category].hex }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(row.kg / maxCategoryKg) * 100}%` }}
                        transition={{ duration: 0.7, delay: 0.05 * i, ease: [0.22, 0.8, 0.2, 1] }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sheet rounded-[3px] p-5">
            <SectionHeading eyebrow="Receiver ledger · this shift" title="Who took the weight" />
            {byRecipient.length === 0 ? (
              <p className="text-[0.82rem] text-ink-3">No completed deliveries yet.</p>
            ) : (
              <ul className="divide-y divide-ink/10">
                {byRecipient.map((row) => (
                  <li key={row.recipient.id} className="flex items-baseline justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[0.85rem] font-semibold">{row.recipient.organization}</p>
                      <p className="data text-[0.66rem] text-ink-3">
                        {row.recipient.type} · {row.recipient.neighborhood}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="data text-[0.85rem] text-moss">{kg(row.kg)}</span>
                      <span className="data ml-2 text-[0.66rem] text-ink-4">
                        {row.loads} {row.loads === 1 ? 'load' : 'loads'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* --------------------------- honest ledger ------------------------ */}
        <aside className="space-y-4">
          <section className="relative overflow-hidden rounded-[3px] border border-vermillion/35 bg-vermillion/[0.06] p-5">
            <span className="absolute inset-x-0 top-0 h-[3px] bg-vermillion" />
            <div className="flex items-center gap-2">
              <TriangleAlert size={15} className="text-vermillion-2" />
              <span className="eyebrow text-vermillion-2">Waste ledger</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="data text-[1.7rem] leading-none text-vermillion-2">{kg(wastedAnimated)}</div>
                <div className="eyebrow mt-1 text-ink-3">lost to expiry</div>
              </div>
              <div>
                <div className="data text-[1.7rem] leading-none text-vermillion-2">{fmtMeals(mealsLost)}</div>
                <div className="eyebrow mt-1 text-ink-3">meals not served</div>
              </div>
            </div>
            <p className="mt-3 text-[0.74rem] leading-relaxed text-ink-2">
              {expired.length === 0
                ? 'No load has been lost this session yet.'
                : `${expired.length} ${expired.length === 1 ? 'load was' : 'loads were'} not placed in time. These stay on the books — a rescue operation that hides its misses cannot improve.`}
            </p>
          </section>

          <section className="sheet rounded-[3px] p-5">
            <div className="flex items-center gap-2">
              <Leaf size={14} className="text-moss" />
              <span className="eyebrow text-ink-3">Equivalent impact</span>
            </div>
            <p className="mt-2 text-[0.78rem] leading-relaxed text-ink-2">
              {kg(deliveredKg)} of edible food kept in the food system instead of the bin. Every kilogram
              here was weighed at the donor door, not estimated.
            </p>
            <div className="mt-3 border-t border-ink/12 pt-3">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow text-ink-3">Average load</span>
                <span className="data text-[0.8rem]">
                  {delivered.length ? kg(deliveredKg / delivered.length) : '—'}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="eyebrow text-ink-3">Fastest rescue</span>
                <span className="data text-[0.8rem]">
                  {fastestRescue(state.items) ?? '—'}
                </span>
              </div>
            </div>
          </section>

          <section className="sheet flex max-h-[32rem] flex-col rounded-[3px] p-5">
            <SectionHeading eyebrow="Activity" title="Recent moves" />
            <ol className="no-scrollbar -mr-2 flex-1 space-y-3 overflow-y-auto pr-2">
              {state.log.slice(0, 22).map((entry, i) => (
                <motion.li
                  key={entry.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.24) }}
                  className="flex gap-3"
                >
                  <span className="data mt-[3px] w-[2.7rem] shrink-0 text-[0.62rem] text-ink-4">
                    {shortTime(entry.at)}
                  </span>
                  <span className="border-l border-ink/15 pl-3">
                    <span className="block text-[0.74rem] leading-snug text-ink-2">{entry.message}</span>
                    <span className="data mt-0.5 flex items-center gap-2 text-[0.6rem]">
                      <span style={{ color: KIND_COLOR[entry.kind] }}>{entry.kind.replace('_', ' ')}</span>
                      <span className="text-ink-4">{relativeShort(entry.at, state.now)}</span>
                      {entry.itemId && (
                        <button
                          onClick={() =>
                            dispatch({ type: 'OPEN_ITEM', itemId: entry.itemId as string })
                          }
                          className="inline-flex items-center gap-0.5 text-ink-3 underline decoration-dotted transition-colors hover:text-ink"
                        >
                          open <ArrowRight size={9} />
                        </button>
                      )}
                    </span>
                  </span>
                </motion.li>
              ))}
            </ol>
          </section>

          <section className="sheet rounded-[3px] p-5">
            <span className="eyebrow text-ink-3">Active redistributions</span>
            <ul className="mt-2 space-y-2">
              {active.length === 0 && <li className="text-[0.8rem] text-ink-3">Nothing in flight.</li>}
              {active.map((item) => {
                const recipient = item.match ? recipientById.get(item.match.recipientId) : undefined;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => dispatch({ type: 'OPEN_ITEM', itemId: item.id })}
                      className="w-full rounded-[2px] border border-ink/15 px-2.5 py-2 text-left transition-colors hover:border-ink/45"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[0.76rem] font-semibold">{item.title}</span>
                        <span className="data text-[0.62rem] text-ink-4">{kg(item.quantityKg)}</span>
                      </span>
                      <span className="data mt-0.5 block text-[0.64rem] text-ink-3">
                        {recipient ? recipient.organization : 'awaiting a recipient'} · {item.status.replace('_', ' ')}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="px-1 text-[0.68rem] leading-relaxed text-ink-4">
            All organisations, addresses and figures in this console are fictional and for demonstration
            only. Nothing here represents a real food bank, donor or statistic.
          </p>
        </aside>
      </div>
    </div>
  );
}

/** Six fictional prior days plus today's live figure, so the ledger opens with weight. */
function WeekChart({ todayKg, todayWastedKg }: { todayKg: number; todayWastedKg: number }) {
  const days = [
    ...[...impactHistory]
      .sort((a, b) => b.daysAgo - a.daysAgo)
      .map((d) => ({
        key: `d${d.daysAgo}`,
        label: new Date(EPOCH - d.daysAgo * 86_400_000).toLocaleDateString('en-GB', { weekday: 'short' }),
        full: new Date(EPOCH - d.daysAgo * 86_400_000).toLocaleDateString('en-GB', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
        }),
        delivered: d.kgDiverted,
        wasted: d.kgWasted,
        isToday: false,
      })),
    { key: 'today', label: 'Today', full: 'Today, live', delivered: todayKg, wasted: todayWastedKg, isToday: true },
  ];

  const max = Math.max(...days.map((d) => d.delivered + d.wasted));
  const totalDelivered = days.reduce((s, d) => s + d.delivered, 0);
  const totalWasted = days.reduce((s, d) => s + d.wasted, 0);

  return (
    <section className="sheet rounded-[3px] p-5">
      <SectionHeading eyebrow="Last seven days" title="Where the weight went" />

      <div className="flex h-[132px] items-end gap-1.5 sm:gap-2.5">
        {days.map((d, i) => {
          const deliveredPct = (d.delivered / max) * 100;
          const wastedPct = (d.wasted / max) * 100;
          return (
            <div key={d.key} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.full} · ${kg(d.delivered)} rescued · ${kg(d.wasted)} wasted`}>
              <span className="data pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.58rem] text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">
                {kg(d.delivered)}
              </span>
              <motion.div
                className="w-full rounded-t-[1px]"
                style={{ background: d.isToday ? 'var(--color-moss)' : 'rgba(76,93,51,0.55)' }}
                initial={{ height: 0 }}
                animate={{ height: `${deliveredPct}%` }}
                transition={{ duration: 0.6, delay: 0.05 * i, ease: [0.22, 0.8, 0.2, 1] }}
              />
              <motion.div
                className="hatch w-full"
                style={{ background: 'rgba(207,63,22,0.14)' }}
                initial={{ height: 0 }}
                animate={{ height: `${wastedPct}%` }}
                transition={{ duration: 0.6, delay: 0.05 * i, ease: [0.22, 0.8, 0.2, 1] }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5 border-t border-ink/15 pt-1.5 sm:gap-2.5">
        {days.map((d) => (
          <span
            key={d.key}
            className={`data flex-1 text-center text-[0.58rem] ${d.isToday ? 'font-semibold text-vermillion' : 'text-ink-4'}`}
          >
            {d.label}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-ink/12 pt-3">
        <span className="data text-[0.7rem] text-ink-2">
          <span className="text-moss">{kg(totalDelivered)}</span> rescued over 7 days
          <span className="mx-2 text-ink-4">·</span>
          <span className="text-vermillion-2">{kg(totalWasted)}</span> wasted
          <span className="mx-2 text-ink-4">·</span>
          {Math.round((totalDelivered / (totalDelivered + totalWasted)) * 100)}% rescue rate
        </span>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.68rem] text-ink-4">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3 rounded-[1px] bg-moss" /> delivered to a recipient
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="hatch inline-block h-2.5 w-3 rounded-[1px]" style={{ background: 'rgba(207,63,22,0.18)' }} /> lost
          to expiry
        </span>
        <span>Monday to Saturday are fictional prior shifts; today’s bar is live.</span>
      </p>
    </section>
  );
}

function fastestRescue(items: { reportedAt: number; deliveredAt?: number; status: string }[]): string | null {
  const times = items
    .filter((i) => i.status === 'delivered' && i.deliveredAt)
    .map((i) => (i.deliveredAt! - i.reportedAt) / 60000);
  if (times.length === 0) return null;
  const best = Math.min(...times);
  const h = Math.floor(best / 60);
  const m = Math.round(best % 60);
  return h > 0 ? `${h}h ${m}m from intake` : `${m}m from intake`;
}

function Hero({
  eyebrow,
  value,
  icon,
  tone,
  delay,
}: {
  eyebrow: string;
  value: string;
  icon: React.ReactNode;
  tone: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 0.8, 0.2, 1] }}
      className="sheet relative overflow-hidden rounded-[3px] p-4"
    >
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: tone }} />
      <div className="flex items-center justify-between">
        <span className="eyebrow text-ink-3">{eyebrow}</span>
        <span style={{ color: tone }}>{icon}</span>
      </div>
      <div className="data mt-3 text-[2.1rem] leading-none" style={{ color: tone }}>
        {value}
      </div>
    </motion.div>
  );
}
