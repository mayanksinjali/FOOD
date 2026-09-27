import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Gauge, HelpCircle, ListChecks, RotateCcw, TrendingUp, Undo2, Users } from 'lucide-react';
import { CLOCK_SPEEDS, useStore } from '../store/AppStore';
import { clockTime, longDate } from '../lib/format';
import { ACTIVE_STATUSES } from '../lib/catalog';
import { computeUrgency } from '../lib/urgency';
import type { ViewName } from '../types';
import { Toasts } from './Toasts';
import { Briefing } from './Briefing';

const NAV: { name: ViewName; label: string; icon: typeof ListChecks }[] = [
  { name: 'triage', label: 'Triage board', icon: ListChecks },
  { name: 'recipients', label: 'Recipients', icon: Users },
  { name: 'impact', label: 'Impact', icon: TrendingUp },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();
  const { now } = state;

  const openItems = state.items.filter((i) => (ACTIVE_STATUSES as readonly string[]).includes(i.status));
  const critical = openItems.filter((i) => computeUrgency(i, now).level === 'critical').length;
  const inFlight = state.items.filter((i) =>
    ['matched', 'pickup_scheduled', 'picked_up'].includes(i.status),
  ).length;
  const active = state.view.name;

  const go = (name: ViewName) => dispatch({ type: 'NAVIGATE', view: { name } });

  return (
    <div className="grain relative min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px]">
        {/* ------------------------------- rail ------------------------------ */}
        <aside className="sticky top-0 hidden h-screen w-[16.5rem] shrink-0 flex-col border-r border-ink/15 bg-paper-2/70 px-5 py-6 lg:flex">
          <Brand />

          <nav className="mt-8 flex flex-col gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.name || (item.name === 'triage' && active === 'workflow');
              return (
                <button
                  key={item.name}
                  onClick={() => go(item.name)}
                  className={`group relative flex items-center gap-3 rounded-[3px] px-3 py-2.5 text-left transition-colors ${
                    isActive ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-ink/[0.06]'
                  }`}
                >
                  <Icon size={16} strokeWidth={2} />
                  <span className="text-[0.82rem] font-semibold tracking-tight">{item.label}</span>
                  <span
                    className={`data ml-auto text-[0.65rem] ${isActive ? 'text-paper/70' : 'text-ink-3'}`}
                  >
                    {item.name === 'triage'
                      ? openItems.length
                      : item.name === 'recipients'
                        ? state.recipients.length
                        : state.items.filter((i) => i.status === 'delivered').length}
                  </span>
                  {isActive && (
                    <motion.span
                      layoutId="rail-marker"
                      className="absolute -left-5 top-1/2 h-6 w-[3px] -translate-y-1/2 bg-vermillion"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-8 border-t border-ink/15 pt-4">
            <div className="eyebrow mb-2 text-ink-3">Network pulse</div>
            <PulseRow label="Critical now" value={critical} tone="var(--color-vermillion)" />
            <PulseRow label="In flight" value={inFlight} tone="var(--color-ocean)" />
            <PulseRow
              label="Open items"
              value={openItems.length}
              tone="var(--color-ink-2)"
            />
          </div>

          <div className="mt-auto space-y-3 pt-6">
            <div className="sheet-sunk rounded-[3px] p-3">
              <div className="eyebrow mb-1 text-ink-3">Simulated clock</div>
              <div className="data text-2xl leading-none">{clockTime(now)}</div>
              <div className="data mt-1 text-[0.65rem] text-ink-3">{longDate(now)}</div>
              <div className="mt-3 flex gap-1">
                {CLOCK_SPEEDS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => dispatch({ type: 'SET_SPEED', speed: s.value })}
                    title={s.hint}
                    className={`data flex-1 rounded-[2px] border px-1 py-1 text-[0.62rem] transition-colors ${
                      state.clockSpeed === s.value
                        ? 'border-ink bg-ink text-paper'
                        : 'border-ink/20 text-ink-3 hover:border-ink/40'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                <button
                  className="btn flex-1 px-1 py-1 text-[0.62rem]"
                  onClick={() => dispatch({ type: 'TICK', delta: 15 * 60_000 })}
                >
                  +15m
                </button>
                <button
                  className="btn flex-1 px-1 py-1 text-[0.62rem]"
                  onClick={() => dispatch({ type: 'TICK', delta: 60 * 60_000 })}
                >
                  +1h
                </button>
              </div>
            </div>
            <button
              onClick={() => dispatch({ type: 'OPEN_BRIEFING' })}
              className="btn w-full justify-center text-[0.7rem]"
            >
              <HelpCircle size={12} /> How this works
            </button>
            <button
              onClick={() => dispatch({ type: 'RESET' })}
              className="btn w-full justify-center text-[0.65rem] text-ink-3"
              title="Restore the starting manifest (undoable)"
            >
              <RotateCcw size={12} /> Reset the shift
            </button>
          </div>
        </aside>

        {/* ------------------------------ content ---------------------------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <OpsStrip />
          <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
        </div>
      </div>

      {/* --------------------------- mobile nav ----------------------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink/15 bg-paper/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.name === active || (item.name === 'triage' && active === 'workflow');
          return (
            <button
              key={item.name}
              onClick={() => go(item.name)}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.6rem] font-semibold uppercase tracking-wider ${
                isActive ? 'text-vermillion' : 'text-ink-3'
              }`}
            >
              <Icon size={17} strokeWidth={2} />
              {item.label.split(' ')[0]}
              {isActive && (
                <motion.span layoutId="mobile-marker" className="absolute inset-x-4 top-0 h-[2px] bg-vermillion" />
              )}
            </button>
          );
        })}
      </nav>

      <Toasts />
      <Briefing />
    </div>
  );
}

function Brand() {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 items-end gap-[2px]" aria-hidden>
          {[10, 16, 22, 12, 26, 18].map((h, i) => (
            <motion.span
              key={i}
              initial={{ height: 4 }}
              animate={{ height: h }}
              transition={{ delay: 0.05 * i, duration: 0.5, ease: [0.22, 0.8, 0.2, 1] }}
              className="w-[3px]"
              style={{ background: i === 4 ? 'var(--color-vermillion)' : 'var(--color-ink)' }}
            />
          ))}
        </span>
        <span className="display text-[1.35rem] leading-none">Salvage</span>
      </div>
      <div className="data mt-2 text-[0.6rem] leading-relaxed tracking-[0.13em] text-ink-3 uppercase">
        Northgate
        <br />
        Food recovery ops
      </div>
    </div>
  );
}

function PulseRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[0.72rem] text-ink-3">{label}</span>
      <span className="data text-[0.85rem] font-medium" style={{ color: tone }}>
        {value}
      </span>
    </div>
  );
}

function OpsStrip() {
  const { state, dispatch } = useStore();
  const { now } = state;
  const open = state.items.filter((i) => !['delivered', 'expired'].includes(i.status));
  const critical = open.filter((i) => computeUrgency(i, now).level === 'critical').length;

  return (
    <header className="sticky top-0 z-30 border-b border-ink/15 bg-paper/88 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <div className="eyebrow text-ink-3">{longDate(now)} · shift live</div>
          <div className="flex items-baseline gap-2">
            <span className="data text-[1.6rem] leading-none">{clockTime(now)}</span>
            <span className="data text-[0.6rem] uppercase tracking-[0.2em] text-vermillion">
              sim · {state.clockSpeed}×
            </span>
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <span
            className="tag"
            style={{
              color: critical ? 'var(--color-vermillion)' : 'var(--color-ink-3)',
              borderColor: critical ? 'rgba(207,63,22,0.4)' : 'rgba(22,19,12,0.2)',
            }}
          >
            <Gauge size={11} /> {critical} critical
          </span>
          <span className="chip">{open.length} open</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button
            onClick={() => dispatch({ type: 'UNDO' })}
            disabled={state.past.length === 0}
            title={state.undoLabel ? `Undo: ${state.undoLabel}` : 'Nothing to undo yet'}
            className="btn px-2 py-1 text-[0.65rem]"
          >
            <Undo2 size={12} /> Undo
            {state.undoLabel && (
              <span className="hidden max-w-[13rem] truncate text-ink-3 xl:inline">
                · {state.undoLabel}
              </span>
            )}
          </button>
          <button
            onClick={() => dispatch({ type: 'OPEN_BRIEFING' })}
            className="btn px-2 py-1 text-[0.65rem]"
            title="How this app works"
          >
            <HelpCircle size={12} /> How this works
          </button>

          {/* The rail carries the clock controls from lg up. */}
          <span className="mx-1 hidden h-5 w-px bg-ink/15 lg:block" />
          <div className="flex items-center gap-1 lg:hidden">
            {CLOCK_SPEEDS.map((s) => (
              <button
                key={s.value}
                onClick={() => dispatch({ type: 'SET_SPEED', speed: s.value })}
                title={s.hint}
                className={`data rounded-[2px] border px-2 py-1 text-[0.65rem] transition-colors ${
                  state.clockSpeed === s.value
                    ? 'border-ink bg-ink text-paper'
                    : 'border-ink/20 text-ink-3 hover:border-ink/40'
                }`}
              >
                {s.label}
              </button>
            ))}
            <button
              className="btn px-2 py-1 text-[0.65rem]"
              onClick={() => dispatch({ type: 'TICK', delta: 15 * 60_000 })}
            >
              +15m
            </button>
            <button
              className="btn px-2 py-1 text-[0.65rem]"
              onClick={() => dispatch({ type: 'TICK', delta: 60 * 60_000 })}
            >
              +1h
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
