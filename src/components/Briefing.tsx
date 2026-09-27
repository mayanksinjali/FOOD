import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Clock,
  Handshake,
  ListChecks,
  Truck,
  Utensils,
  X,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { computeUrgency } from '../lib/urgency';
import { kg } from '../lib/format';
import { URGENCY } from '../lib/catalog';

const FLOW = [
  {
    n: 1,
    title: 'Surplus reported',
    body: 'A restaurant, bakery or grocery logs food that is still edible but is running out of time.',
  },
  {
    n: 2,
    title: 'Urgency scored',
    body: 'Two inputs only: how long is left, and how fast that food spoils. Under three hours is always critical.',
  },
  {
    n: 3,
    title: 'Recipients ranked',
    body: 'Shelters and food banks are filtered by storage, capacity and whether they can get there in time — then scored.',
  },
  {
    n: 4,
    title: 'Match confirmed',
    body: 'You pick a recipient. The reasoning is shown in plain words, and you can override the top pick.',
  },
  {
    n: 5,
    title: 'Pickup booked',
    body: 'Recipient collects, a volunteer driver runs it, or the donor drops it off. The app blocks times that miss the expiry.',
  },
  {
    n: 6,
    title: 'Delivered + counted',
    body: 'Mark it delivered and the impact ledger moves. Miss the window and it is recorded as waste, honestly.',
  },
];

export function Briefing() {
  const { state, dispatch } = useStore();
  const open = state.briefingOpen;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'CLOSE_BRIEFING' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dispatch]);

  const mostUrgent = state.items
    .filter((i) => i.status === 'reported')
    .map((item) => ({ item, urgency: computeUrgency(item, state.now) }))
    .sort((a, b) => b.urgency.score - a.urgency.score)[0];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 px-3 py-6 backdrop-blur-sm sm:items-center sm:py-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => dispatch({ type: 'CLOSE_BRIEFING' })}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="How this app works"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.32, ease: [0.22, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="sheet relative w-full max-w-[58rem] rounded-[3px]"
          >
            <div className="perf-top" />
            <span className="stamp absolute right-5 top-6 hidden rotate-[7deg] text-vermillion sm:block">
              read once
            </span>

            <div className="p-5 sm:p-8">
              <div className="eyebrow text-ink-3">Briefing · the job in one screen</div>
              <h1 className="display mt-2 max-w-[24ch] text-[1.9rem] leading-[1.03] sm:text-[2.5rem]">
                Edible food usually becomes waste in the gap between “still good” and “nobody decided”
                <span className="text-vermillion">.</span>
              </h1>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <p className="text-[0.85rem] leading-relaxed text-ink-2">
                  You are the <strong className="font-semibold">redistribution coordinator</strong>. Donors
                  report surplus all morning. Shelters, food banks and community kitchens can take some of
                  it — but each one has its own storage, its own daily capacity and its own list of what it
                  actually needs.
                </p>
                <p className="text-[0.85rem] leading-relaxed text-ink-2">
                  Your job is the decision in the middle: <em>what needs attention, who can take it, why
                  they suit it, and did it actually get there.</em> Nothing in this app is a mock button —
                  every stage below changes real state, and the clock keeps running while you think.
                </p>
              </div>

              {/* ------------------------- the six steps ---------------------- */}
              <div className="mt-7 border-t border-ink/15 pt-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="eyebrow text-ink-3">The flow every load follows</span>
                  <span className="data text-[0.62rem] text-ink-4">
                    the workflow screen walks you through these, in order
                  </span>
                </div>

                <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {FLOW.map((step, i) => (
                    <motion.li
                      key={step.n}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 + i * 0.05, duration: 0.35 }}
                      className="relative rounded-[3px] border border-ink/15 bg-paper-2/50 p-3.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="data flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[0.62rem] text-paper">
                          {step.n}
                        </span>
                        <span className="display text-[1.02rem] leading-tight">{step.title}</span>
                      </div>
                      <p className="mt-1.5 text-[0.76rem] leading-snug text-ink-3">{step.body}</p>
                    </motion.li>
                  ))}
                </ol>
              </div>

              {/* ------------------------ where to look ---------------------- */}
              <div className="mt-6 grid gap-3 border-t border-ink/15 pt-5 sm:grid-cols-3">
                <Point icon={<ListChecks size={14} />} title="Triage board">
                  Every open load, worst first. Click any row to work it. Rows under three hours are marked
                  critical.
                </Point>
                <Point icon={<Handshake size={14} />} title="Item workflow">
                  The decision screen: urgency explained, recipients ranked with reasons, pickup booked,
                  status advanced.
                </Point>
                <Point icon={<Utensils size={14} />} title="Impact ledger">
                  Meals and kilos from completed deliveries — and the weight lost to expiry, counted just
                  as plainly.
                </Point>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink/15 pt-5">
                {mostUrgent && (
                  <button
                    className="btn btn-urgent"
                    onClick={() => dispatch({ type: 'OPEN_ITEM', itemId: mostUrgent.item.id })}
                  >
                    <Clock size={14} /> Start with the most urgent load · {mostUrgent.item.code}
                    <ArrowRight size={14} />
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => dispatch({ type: 'CLOSE_BRIEFING' })}>
                  Just show me the board
                </button>
                <span className="data text-[0.68rem] text-ink-3">
                  {mostUrgent
                    ? `${kg(mostUrgent.item.quantityKg)} of ${mostUrgent.item.title.toLowerCase()} — ${mostUrgent.urgency.score}/100, ${URGENCY[mostUrgent.urgency.level].label.toLowerCase()}`
                    : 'no open loads'}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-start gap-2 text-[0.68rem] leading-relaxed text-ink-4">
                <Truck size={12} className="mt-[3px] shrink-0" />
                <p className="max-w-[70ch]">
                  All donors, recipients, drivers, addresses and figures are fictional. The clock is
                  simulated and in-memory only — speed it up from the header to watch urgency climb and
                  unattended loads expire. Reopen this briefing any time from “How this works”.
                </p>
              </div>
            </div>

            <button
              onClick={() => dispatch({ type: 'CLOSE_BRIEFING' })}
              aria-label="Close briefing"
              className="absolute right-4 top-5 flex h-7 w-7 items-center justify-center rounded-[2px] border border-ink/20 text-ink-3 transition-colors hover:border-ink/45 hover:text-ink sm:top-4"
            >
              <X size={14} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Point({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-[2px] text-vermillion">{icon}</span>
      <div>
        <div className="text-[0.78rem] font-semibold">{title}</div>
        <p className="mt-0.5 text-[0.74rem] leading-snug text-ink-3">{children}</p>
      </div>
    </div>
  );
}
