import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Clock, MapPin, Phone, User } from 'lucide-react';
import { useStore } from '../store/AppStore';
import type { Recipient } from '../types';
import { CATEGORY, NEED } from '../lib/catalog';
import { hourLabel, kg } from '../lib/format';
import { availableKg } from '../lib/matching';
import { CategoryMark, NeedMeter, StorageChip, UrgencyTag } from '../components/primitives';
import { computeUrgency } from '../lib/urgency';

type Sort = 'headroom' | 'need' | 'response' | 'name';

export function RecipientsView() {
  const { state, dispatch } = useStore();
  const [type, setType] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('headroom');
  const [query, setQuery] = useState('');

  const types = useMemo(
    () => Array.from(new Set(state.recipients.map((r) => r.type))).sort(),
    [state.recipients],
  );

  const openByRecipient = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of state.items) {
      if (item.match && item.status !== 'delivered' && item.status !== 'expired') {
        map.set(item.match.recipientId, (map.get(item.match.recipientId) ?? 0) + 1);
      }
    }
    return map;
  }, [state.items]);

  const ranked = useMemo(() => {
    const list = state.recipients.filter((r) => {
      const matchesType = type === 'all' || r.type === type;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        q === '' ||
        r.organization.toLowerCase().includes(q) ||
        r.neighborhood.toLowerCase().includes(q);
      return matchesType && matchesQuery;
    });

    const needWeight = (r: Recipient) =>
      (Object.values(r.needs) as string[]).reduce(
        (sum, lvl) => sum + (NEED[lvl as keyof typeof NEED]?.score ?? 0),
        0,
      );

    return [...list].sort((a, b) => {
      switch (sort) {
        case 'need':
          return needWeight(b) - needWeight(a);
        case 'response':
          return a.avgResponseMinutes - b.avgResponseMinutes;
        case 'name':
          return a.organization.localeCompare(b.organization);
        default:
          return availableKg(b) / b.capacityKgPerDay - availableKg(a) / a.capacityKgPerDay;
      }
    });
  }, [state.recipients, type, sort, query]);

  const totalFree = state.recipients.reduce((sum, r) => sum + availableKg(r), 0);

  return (
    <div className="mx-auto max-w-[1180px]">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <div className="eyebrow text-ink-3">Directory · active recipients</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <h1 className="display max-w-[20ch] text-[2.35rem] leading-[0.95] sm:text-[3.1rem]">
            Who can take it
            <span className="text-vermillion">.</span>
          </h1>
          <div className="flex items-end gap-6 pb-1">
            <div>
              <div className="eyebrow text-ink-3">Organisations</div>
              <div className="data mt-1 text-[1.35rem] leading-none">{state.recipients.length}</div>
            </div>
            <div>
              <div className="eyebrow text-ink-3">Intake free today</div>
              <div className="data mt-1 text-[1.35rem] leading-none text-moss">{kg(totalFree)}</div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          className="field max-w-[16rem]"
          placeholder="Search organisations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {['all', ...types].map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-[3px] border px-3 py-1.5 text-[0.72rem] font-semibold transition-colors ${
                type === t ? 'border-ink bg-ink text-paper' : 'border-ink/20 text-ink-2 hover:border-ink/45'
              }`}
            >
              {t === 'all' ? 'All types' : t}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="eyebrow text-ink-3">Sort</span>
          <div className="flex rounded-[3px] border border-ink/20 p-[2px]">
            {(
              [
                ['headroom', 'Headroom'],
                ['need', 'Need'],
                ['response', 'Speed'],
                ['name', 'A–Z'],
              ] as [Sort, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`rounded-[2px] px-2.5 py-1 text-[0.7rem] font-semibold transition-colors ${
                  sort === key ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {ranked.map((recipient, i) => (
            <RecipientCard
              key={recipient.id}
              recipient={recipient}
              index={i}
              openLoads={openByRecipient.get(recipient.id) ?? 0}
              onOpenItem={(id) => dispatch({ type: 'OPEN_ITEM', itemId: id })}
            />
          ))}
        </AnimatePresence>
      </div>

      {ranked.length === 0 && (
        <p className="mt-10 text-center text-[0.85rem] text-ink-3">No recipient matches that filter.</p>
      )}
    </div>
  );
}

function RecipientCard({
  recipient,
  index,
  openLoads,
  onOpenItem,
}: {
  recipient: Recipient;
  index: number;
  openLoads: number;
  onOpenItem: (id: string) => void;
}) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const free = availableKg(recipient);
  const usedPct = recipient.currentIntakeKg / recipient.capacityKgPerDay;

  const assigned = state.items.filter(
    (item) => item.match?.recipientId === recipient.id && item.status !== 'delivered' && item.status !== 'expired',
  );
  const delivered = state.items.filter(
    (item) => item.match?.recipientId === recipient.id && item.status === 'delivered',
  );

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.36, delay: Math.min(index * 0.035, 0.28), ease: [0.22, 0.8, 0.2, 1] }}
      className="sheet flex flex-col rounded-[3px]"
    >
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="tag text-ink-3" style={{ borderColor: 'rgba(22,19,12,0.22)' }}>
              {recipient.type}
            </span>
            <h3 className="display mt-2 text-[1.28rem] leading-tight">{recipient.organization}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-[0.72rem] text-ink-3">
              <MapPin size={11} /> {recipient.neighborhood}
            </p>
          </div>
          {openLoads > 0 && (
            <span className="chip text-ocean" style={{ borderColor: 'rgba(28,77,92,0.35)' }}>
              {openLoads} inbound
            </span>
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow text-ink-3">Today's intake</span>
            <span className="data text-[0.7rem] text-ink-3">
              {Math.round(recipient.currentIntakeKg)} / {recipient.capacityKgPerDay} kg
            </span>
          </div>
          <div className="relative mt-1.5 h-[8px] w-full overflow-hidden rounded-[2px] border border-ink/15 bg-ink/[0.06]">
            <motion.div
              className="absolute inset-y-0 left-0"
              style={{ background: usedPct > 0.85 ? 'var(--color-vermillion)' : 'var(--color-ocean)' }}
              initial={{ width: 0 }}
              animate={{ width: `${usedPct * 100}%` }}
              transition={{ duration: 0.7, ease: [0.22, 0.8, 0.2, 1] }}
            />
          </div>
          <div className="data mt-1 flex justify-between text-[0.62rem] text-ink-4">
            <span style={{ color: free > 0 ? 'var(--color-moss)' : 'var(--color-vermillion-2)' }}>
              {free > 0 ? `${Math.round(free)} kg free` : 'intake full'}
            </span>
            <span>{Math.round(usedPct * 100)}% used</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {recipient.acceptedStorage.map((s) => (
            <StorageChip key={s} storage={s} compact />
          ))}
        </div>

        <div className="mt-4 border-t border-ink/12 pt-3">
          <div className="eyebrow mb-2 text-ink-3">Declared needs</div>
          <ul className="space-y-1.5">
            {(Object.entries(recipient.needs) as [keyof typeof CATEGORY, string][])
              .sort((a, b) => NEED[b[1] as keyof typeof NEED].score - NEED[a[1] as keyof typeof NEED].score)
              .map(([category, level]) => (
                <li key={category} className="flex items-center justify-between gap-3">
                  <span
                    className="inline-flex items-center gap-1.5 text-[0.75rem]"
                    style={{ color: CATEGORY[category].hex }}
                  >
                    <CategoryMark category={category} size={12} />
                    {CATEGORY[category].label}
                  </span>
                  <NeedMeter level={level as never} />
                </li>
              ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-ink/12 px-4 py-2.5">
        <div className="data flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.65rem] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={11} /> intake {hourLabel(recipient.intakeOpensHour)}–{hourLabel(recipient.intakeClosesHour)}
          </span>
          <span>responds ~{recipient.avgResponseMinutes} min</span>
        </div>
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between border-t border-ink/12 px-4 py-2.5 text-left text-[0.72rem] font-semibold text-ink-2 transition-colors hover:bg-ink/[0.03]"
      >
        {open ? 'Hide profile' : 'Profile & current loads'}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 0.8, 0.2, 1] }}
            className="overflow-hidden border-t border-ink/12"
          >
            <div className="space-y-3 px-4 py-3">
              <p className="text-[0.74rem] leading-relaxed text-ink-3">{recipient.notes}</p>
              <div className="data space-y-1 text-[0.68rem] text-ink-3">
                <p className="flex items-center gap-1.5">
                  <User size={11} /> {recipient.contact}
                </p>
                <p className="flex items-center gap-1.5">
                  <Phone size={11} /> {recipient.phone}
                </p>
              </div>

              {assigned.length > 0 && (
                <div>
                  <div className="eyebrow mb-1.5 text-ink-3">Loads inbound</div>
                  <ul className="space-y-1.5">
                    {assigned.map((item) => {
                      const u = computeUrgency(item, state.now);
                      return (
                        <li key={item.id}>
                          <button
                            onClick={() => onOpenItem(item.id)}
                            className="flex w-full items-center justify-between gap-2 rounded-[2px] border border-ink/15 px-2 py-1.5 text-left transition-colors hover:border-ink/40"
                          >
                            <span className="truncate text-[0.72rem]">{item.title}</span>
                            <UrgencyTag level={u.level} score={u.score} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <p className="data text-[0.68rem] text-ink-4">
                {delivered.length} loads received in this session ·{' '}
                {kg(delivered.reduce((s, i) => s + i.quantityKg, 0))} rescued
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
