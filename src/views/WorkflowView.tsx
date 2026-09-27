import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  ClipboardCheck,
  Info,
  MapPin,
  Route,
  Scale,
  Store,
  Timer,
  Truck,
  Users,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import type { PickupMethod, Recommendation, SurplusItem, Urgency } from '../types';
import { CATEGORY, NEED, NEXT_ACTION, PICKUP_METHODS, STATUS_META, STORAGE, URGENCY } from '../lib/catalog';
import { countdown, durationLabel, hourLabel, kg, kgPrecise, relativeShort, shortTime } from '../lib/format';
import { distanceKm, travelMinutes } from '../lib/geo';
import { evaluateRecipients } from '../lib/matching';
import { planPickup } from '../lib/logistics';
import { computeUrgency, expiryProgress } from '../lib/urgency';
import { CategoryMark, Countdown, ScoreDial, StatusPill, StorageChip, UrgencyGauge, UrgencyTag } from '../components/primitives';
import { useCountUp } from '../lib/hooks';

const STEPS: { key: string; label: string }[] = [
  { key: 'reported', label: 'Reported' },
  { key: 'matching', label: 'Matching' },
  { key: 'matched', label: 'Matched' },
  { key: 'pickup_scheduled', label: 'Booked' },
  { key: 'picked_up', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
];

export function WorkflowView({ itemId }: { itemId: string }) {
  const { state, itemById, donorById, recipientById, driverById, dispatch } = useStore();
  const { now } = state;
  const item = itemById.get(itemId);

  if (!item) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <p className="display text-2xl">That load is no longer on the board.</p>
        <button
          className="btn mt-4"
          onClick={() => dispatch({ type: 'NAVIGATE', view: { name: 'triage' } })}
        >
          <ArrowLeft size={14} /> Back to triage
        </button>
      </div>
    );
  }

  const donor = donorById.get(item.donorId)!;
  const urgency = computeUrgency(item, now);
  const donorCoords = donor.coords;

  const evaluation = useMemo(
    () => evaluateRecipients(item, donor, state.recipients, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.id, item.quantityKg, item.status, item.storage, item.category, donor.id, state.recipients, now],
  );

  const matchedRecipient = item.match ? recipientById.get(item.match.recipientId) : undefined;
  const matchedRecommendation = matchedRecipient
    ? evaluation.feasible.find((r) => r.recipient.id === matchedRecipient.id)
    : undefined;

  const stepIndex = item.status === 'expired' ? -1 : STEPS.findIndex((s) => s.key === item.status);

  return (
    <div className="mx-auto max-w-[1180px]">
      <button
        onClick={() => dispatch({ type: 'NAVIGATE', view: { name: 'triage' } })}
        className="group mb-4 inline-flex items-center gap-2 text-[0.75rem] font-semibold text-ink-3 transition-colors hover:text-ink"
      >
        <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />
        Triage board
        <span className="data ml-1 text-ink-4">/ {item.code}</span>
      </button>

      {/* ------------------------------ dossier head ---------------------- */}
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 0.8, 0.2, 1] }}
        className="sheet relative overflow-hidden rounded-[3px]"
      >
        <span
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: URGENCY[urgency.level].hex }}
        />
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={item.status} />
              <span className="text-[0.74rem] text-ink-3">
                {STATUS_META[item.status]?.note} · next: {NEXT_ACTION[item.status]}
              </span>
              <UrgencyTag level={urgency.level} score={urgency.score} />
              <span className="data text-[0.65rem] text-ink-4">{item.code}</span>
            </div>
            <h1 className="display mt-3 text-[2rem] leading-[1.02] sm:text-[2.5rem]">{item.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.82rem] text-ink-2">
              <span className="font-semibold">{donor.name}</span>
              <span className="text-ink-4">·</span>
              <span>{donor.type} in {donor.neighborhood}</span>
              <span className="text-ink-4">·</span>
              <span className="data">{kg(item.quantityKg)}</span>
              <span className="text-ink-4">·</span>
              <span>{item.packaging}</span>
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="chip" style={{ color: CATEGORY[item.category].hex, borderColor: `${CATEGORY[item.category].hex}44` }}>
                <CategoryMark category={item.category} size={12} />
                {CATEGORY[item.category].label}
              </span>
              <StorageChip storage={item.storage} />
              <span className="chip text-ink-2">
                <MapPin size={12} /> {STORAGE[item.storage].short} pickup at donor
              </span>
            </div>
          </div>

          <div className="rounded-[3px] border border-ink/15 bg-ink/[0.035] p-4">
            <div className="eyebrow text-ink-3">Time remaining</div>
            <div className="mt-1 flex items-end gap-3">
              <Countdown hoursRemaining={urgency.hoursRemaining} big />
              <span className="data pb-1 text-[0.68rem] text-ink-3">
                expires {shortTime(item.expiresAt)}
              </span>
            </div>
            <div className="mt-4">
              <UrgencyGauge score={urgency.score} level={urgency.level} />
              <div className="data mt-1.5 flex justify-between text-[0.6rem] uppercase tracking-wider text-ink-4">
                <span>0</span>
                <span>medium</span>
                <span>high</span>
                <span>critical</span>
              </div>
            </div>
            <p className="mt-3 text-[0.74rem] leading-relaxed text-ink-2">{urgency.rationale}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-ink/12 pt-3">
              <Contribution
                label={`Time · ${Math.round(urgency.timeWeight * 100)}%`}
                value={urgency.timeContribution}
                max={urgency.timeWeight * 100}
                color={URGENCY[urgency.level].hex}
              />
              <Contribution
                label={`Perishability · ${Math.round(urgency.perishWeight * 100)}%`}
                value={urgency.perishContribution}
                max={urgency.perishWeight * 100}
                color={CATEGORY[item.category].hex}
              />
            </div>
          </div>
        </div>

        {/* workflow rail */}
        <div className="border-t border-ink/12 bg-paper-2/50 px-5 py-3 sm:px-6">
          {item.status === 'expired' ? (
            <div className="flex items-center gap-2 text-[0.78rem] font-semibold text-vermillion-2">
              <Ban size={14} /> Workflow halted — the window closed before a recipient was confirmed.
            </div>
          ) : (
            <ol className="flex flex-wrap items-center gap-y-2">
              {STEPS.map((step, i) => {
                const done = i < stepIndex;
                const current = i === stepIndex;
                return (
                  <li key={step.key} className="flex items-center">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[0.6rem] ${
                          done
                            ? 'border-moss bg-moss text-paper'
                            : current
                              ? 'border-ink bg-ink text-paper'
                              : 'border-ink/25 text-ink-4'
                        }`}
                      >
                        {done ? <Check size={11} strokeWidth={3} /> : i + 1}
                      </span>
                      <span
                        className={`text-[0.72rem] font-semibold tracking-tight ${
                          current ? 'text-ink' : done ? 'text-ink-2' : 'text-ink-4'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <span className="relative mx-3 h-px w-6 bg-ink/20 sm:w-10">
                        <motion.span
                          className="absolute inset-y-0 left-0 bg-moss"
                          initial={{ width: 0 }}
                          animate={{ width: done ? '100%' : 0 }}
                          transition={{ duration: 0.4, delay: 0.05 * i }}
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </motion.header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${item.status}-${item.match?.recipientId ?? 'none'}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 0.8, 0.2, 1] }}
            >
              <StagePanel
                item={item}
                urgency={urgency}
                evaluation={evaluation}
                matchedRecommendation={matchedRecommendation}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <Dossier item={item} urgency={urgency} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stage panels                                                              */
/* -------------------------------------------------------------------------- */

function StagePanel({
  item,
  urgency,
  evaluation,
  matchedRecommendation,
}: {
  item: SurplusItem;
  urgency: Urgency;
  evaluation: ReturnType<typeof evaluateRecipients>;
  matchedRecommendation?: Recommendation;
}) {
  const { state, dispatch, donorById, recipientById } = useStore();

  switch (item.status) {
    case 'reported':
      return <ReportedPanel item={item} urgency={urgency} recipientCount={evaluation.feasible.length + evaluation.disqualified.length} />;

    case 'matching':
      return <MatchingPanel item={item} evaluation={evaluation} />;

    case 'matched':
      return (
        <MatchedPanel
          item={item}
          recommendation={matchedRecommendation}
          recipientId={item.match!.recipientId}
          topScore={evaluation.feasible[0]?.score ?? item.match!.score}
        />
      );

    case 'pickup_scheduled':
      return <BookedPanel item={item} />;

    case 'picked_up':
      return <InTransitPanel item={item} />;

    case 'delivered': {
      const recipient = recipientById.get(item.match!.recipientId)!;
      const meals = item.quantityKg * CATEGORY[item.category].mealsPerKg;
      return <DeliveredPanel item={item} recipientName={recipient.organization} meals={meals} />;
    }

    case 'expired':
      return (
        <ExpiredPanel
          item={item}
          nearest={evaluation.feasible[0]}
          donorName={donorById.get(item.donorId)?.name ?? 'The donor'}
          now={state.now}
        />
      );

    default:
      return null;
  }
}

/** Plain-language "what happens next" so the screen never leaves you guessing. */
function NextStep({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[3px] border border-ink/15 bg-paper-2/60 px-3.5 py-2.5">
      <ArrowRight size={13} className="mt-[3px] shrink-0 text-vermillion" strokeWidth={2.6} />
      <p className="text-[0.78rem] leading-snug text-ink-2">
        <span className="font-semibold text-ink">What happens next: </span>
        {children}
      </p>
    </div>
  );
}

function PanelShell({
  eyebrow,
  title,
  intro,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="sheet rounded-[3px] p-5 sm:p-6">
      <div className="eyebrow text-ink-3">{eyebrow}</div>
      <h2 className="display mt-1 text-[1.5rem] leading-tight">{title}</h2>
      {intro && <div className="mt-3">{intro}</div>}
      <div className="mt-4">{children}</div>
      {footer && <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink/12 pt-4">{footer}</div>}
    </section>
  );
}

function ReportedPanel({
  item,
  urgency,
  recipientCount,
}: {
  item: SurplusItem;
  urgency: Urgency;
  recipientCount: number;
}) {
  const { dispatch } = useStore();
  return (
    <PanelShell
      eyebrow="Stage 1 · intake"
      title="Nothing has been offered yet"
      footer={
        <>
          <button
            className="btn btn-primary"
            onClick={() => dispatch({ type: 'RUN_MATCHING', itemId: item.id })}
          >
            Run the matching engine <ArrowRight size={14} />
          </button>
          <span className="text-[0.72rem] text-ink-3">
            {recipientCount} recipients will be checked against storage, capacity and timing.
          </span>
        </>
      }
    >
      <NextStep>
        the engine checks every recipient against three hard constraints — compatible storage, free capacity,
        and whether the handover can physically finish before {shortTime(item.expiresAt)} — then ranks
        whoever survives. You then choose one to offer the load to.
      </NextStep>
      <p className="mt-4 max-w-[62ch] text-[0.85rem] leading-relaxed text-ink-2">
        This load is still sitting at the donor and nobody has been offered it yet. Nothing has been
        promised to anybody, so this is the cheapest moment in the whole flow to change your mind.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Fact label="Clock left" value={countdown(urgency.hoursRemaining)} />
        <Fact label="Perishability" value={`${Math.round(CATEGORY[item.category].perishability * 100)}%`} />
        <Fact label="Cold chain" value={STORAGE[item.storage].short} />
      </dl>
    </PanelShell>
  );
}

function MatchingPanel({
  item,
  evaluation,
}: {
  item: SurplusItem;
  evaluation: ReturnType<typeof evaluateRecipients>;
}) {
  const { dispatch } = useStore();
  const [openDisqualified, setOpenDisqualified] = useState(false);
  const topScore = evaluation.feasible[0]?.score ?? 0;

  return (
    <section className="space-y-4">
      <section className="sheet rounded-[3px] p-5">
        <div className="eyebrow text-ink-3">Stage 2 · recipients evaluated</div>
        <h2 className="display mt-1 text-[1.5rem] leading-tight">Who can take this load</h2>
        <div className="mt-3">
          <NextStep>
            confirm one recipient — the top pick or any other feasible one. That locks the match, and the
            screen then asks you to book the pickup.
          </NextStep>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink/12 pt-3">
          <span className="data text-[0.8rem]">
            <span className="text-moss">{evaluation.feasible.length} feasible</span>
            <span className="mx-2 text-ink-4">·</span>
            <span className="text-vermillion-2">{evaluation.disqualified.length} ruled out</span>
          </span>
          <span className="text-[0.72rem] leading-snug text-ink-3">
            Every score is out of 100, built from need 30 · distance 25 · capacity 20 · response speed 15
            · food/storage fit 10. The bullets on each card are those factors in plain words.
          </span>
        </div>
      </section>

      {evaluation.feasible.map((rec, i) => (
        <RecommendationCard
          key={rec.recipient.id}
          rec={rec}
          rank={i + 1}
          topScore={topScore}
          onConfirm={() =>
            dispatch({
              type: 'CONFIRM_MATCH',
              itemId: item.id,
              recipientId: rec.recipient.id,
              score: rec.score,
              topScore,
            })
          }
        />
      ))}

      {evaluation.feasible.length === 0 && (
        <div className="rounded-[3px] border border-vermillion/40 bg-vermillion/[0.06] p-5">
          <div className="flex items-center gap-2 font-semibold text-vermillion-2">
            <AlertTriangle size={15} /> No recipient can take this load in time
          </div>
          <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-2">
            Every candidate fails a hard constraint. The honest options are to extend the donor's holding
            time, split the load, or record it as waste. This app will keep the clock running.
          </p>
        </div>
      )}

      {evaluation.disqualified.length > 0 && (
        <div className="sheet overflow-hidden rounded-[3px]">
          <button
            onClick={() => setOpenDisqualified((v) => !v)}
            className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
          >
            <Ban size={15} className="text-vermillion-2" />
            <span className="text-[0.85rem] font-semibold">
              {evaluation.disqualified.length} recipients ruled out
            </span>
            <span className="ml-auto data text-[0.68rem] text-ink-3">
              {openDisqualified ? 'hide reasons' : 'show why'}
            </span>
          </button>
          <AnimatePresence initial={false}>
            {openDisqualified && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 0.8, 0.2, 1] }}
                className="overflow-hidden border-t border-ink/12"
              >
                {evaluation.disqualified.map((d) => (
                  <div key={d.recipient.id} className="border-b border-ink/10 px-5 py-3 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.85rem] font-semibold">{d.recipient.organization}</span>
                      <span className="tag text-vermillion-2" style={{ borderColor: 'rgba(160,44,12,0.4)' }}>
                        {d.code === 'expiry' ? 'too slow' : d.code === 'window' ? 'desk closed' : d.code}
                      </span>
                      <span className="text-[0.75rem] text-ink-3">{d.reason}</span>
                    </div>
                    <p className="mt-1 max-w-[70ch] text-[0.75rem] leading-relaxed text-ink-3">{d.detail}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function RecommendationCard({
  rec,
  rank,
  topScore,
  onConfirm,
}: {
  rec: Recommendation;
  rank: number;
  topScore: number;
  onConfirm: () => void;
}) {
  const { recipient, breakdown } = rec;
  const isTop = rank === 1;
  const color = isTop ? 'var(--color-moss)' : 'var(--color-ocean)';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(rank * 0.07, 0.3), ease: [0.22, 0.8, 0.2, 1] }}
      className={`sheet relative overflow-hidden rounded-[3px] ${isTop ? 'ring-1 ring-moss/30' : ''}`}
    >
      {isTop && (
        <span className="absolute right-0 top-0 bg-moss px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-paper">
          Top match
        </span>
      )}
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <ScoreDial score={rec.score} color={color} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="display text-[1.28rem] leading-tight">{recipient.organization}</h3>
            <span className="chip text-ink-2">{recipient.type}</span>
            {rank > 1 && <span className="data text-[0.65rem] text-ink-4">rank {rank}</span>}
          </div>
          <p className="data mt-1 text-[0.68rem] text-ink-3">
            {recipient.neighborhood} · {rec.distanceKm.toFixed(1)} km from the donor · intake{' '}
            {hourLabel(recipient.intakeOpensHour)}–{hourLabel(recipient.intakeClosesHour)}
          </p>

          <ul className="mt-3 space-y-1.5">
            {rec.reasons.map((reason) => (
              <motion.li
                key={reason}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.12 + rank * 0.04 }}
                className="flex items-start gap-2 text-[0.79rem] leading-snug text-ink-2"
              >
                <Check size={13} className="mt-[3px] shrink-0 text-moss" strokeWidth={2.6} />
                {reason}
              </motion.li>
            ))}
          </ul>

          <div className="mt-4 grid grid-cols-5 gap-2 border-t border-ink/12 pt-3">
            <WeightBar label="Need" value={breakdown.need} weight={30} />
            <WeightBar label="Distance" value={breakdown.distance} weight={25} />
            <WeightBar label="Capacity" value={breakdown.capacity} weight={20} />
            <WeightBar label="Speed" value={breakdown.speed} weight={15} />
            <WeightBar label="Fit" value={breakdown.compatibility} weight={10} />
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:w-[9.5rem]">
          <button className={`btn ${isTop ? 'btn-primary' : ''} w-full`} onClick={onConfirm}>
            {isTop ? 'Confirm match' : 'Choose instead'}
          </button>
          <span className="data text-center text-[0.6rem] leading-relaxed text-ink-4">
            {rec.score === topScore ? 'highest score' : `${topScore - rec.score} pts behind top`}
            <br />
            needs ~{durationLabel(rec.requiredMinutes)}
          </span>
        </div>
      </div>
    </motion.article>
  );
}

function WeightBar({ label, value, weight }: { label: string; value: number; weight: number }) {
  return (
    <div>
      <div className="data flex items-baseline justify-between text-[0.58rem] text-ink-4">
        <span className="uppercase tracking-wider">{label}</span>
        <span>{weight}%</span>
      </div>
      <div className="mt-1 h-[3px] w-full rounded-[2px] bg-ink/10">
        <motion.div
          className="h-full rounded-[2px] bg-ink-2"
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6, ease: [0.22, 0.8, 0.2, 1] }}
        />
      </div>
      <div className="data mt-0.5 text-[0.62rem] text-ink-2">{Math.round(value)}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Matched → schedule pickup                                                 */
/* -------------------------------------------------------------------------- */

function MatchedPanel({
  item,
  recommendation,
  recipientId,
  topScore,
}: {
  item: SurplusItem;
  recommendation?: Recommendation;
  recipientId: string;
  topScore: number;
}) {
  const { state, dispatch, recipientById, donorById, driverById } = useStore();
  const recipient = recipientById.get(recipientId)!;
  const donor = donorById.get(item.donorId)!;
  const km = distanceKm(donor.coords, recipient.coords);

  const methods: PickupMethod[] = ['recipient_pickup', 'volunteer_driver', 'donor_dropoff'];
  const [method, setMethod] = useState<PickupMethod>('recipient_pickup');
  const [driverId, setDriverId] = useState<string>('');
  const [note, setNote] = useState('');

  const driver = driverId ? driverById.get(driverId) : undefined;

  const now = state.now;
  const base = Math.ceil(now / 300_000) * 300_000;
  const options = useMemo(() => [15, 30, 60, 120].map((mins) => base + mins * 60_000), [base]);
  const [scheduledFor, setScheduledFor] = useState<number>(() => options[1]);

  useEffect(() => {
    setScheduledFor((prev) => (options.includes(prev) ? prev : options[1]));
  }, [options]);

  const planFor = (t: number) =>
    planPickup({
      method,
      recipient,
      driver,
      km,
      scheduledFor: t,
      expiresAt: item.expiresAt,
      quantityKg: item.quantityKg,
      requiresCold: item.storage !== 'ambient',
    });

  const plan = planFor(scheduledFor);
  const anyWindowFits = options.some((t) => planFor(t).onTime);
  const slack = Math.max(0, Math.round((item.expiresAt - now) / 60000));

  return (
    <section className="space-y-4">
      <div className="sheet rounded-[3px] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow text-ink-3">Recipient confirmed</div>
            <h2 className="display mt-1 text-[1.5rem] leading-tight">{recipient.organization}</h2>
            <p className="mt-1 text-[0.8rem] text-ink-2">
              {recipient.type} · {recipient.neighborhood} · {km.toFixed(1)} km away
            </p>
          </div>
          <div className="text-right">
            <div className="data text-[1.6rem] leading-none text-moss">{item.match!.score}</div>
            <div className="data text-[0.6rem] uppercase tracking-wider text-ink-4">
              match score
              {item.match!.score < topScore && <span className="block text-ink-3">top pick was {topScore}</span>}
            </div>
          </div>
        </div>
        {recommendation && (
          <ul className="mt-4 grid gap-1.5 border-t border-ink/12 pt-3 sm:grid-cols-2">
            {recommendation.reasons.map((r) => (
              <li key={r} className="flex items-start gap-2 text-[0.78rem] leading-snug text-ink-2">
                <Check size={12} className="mt-[3px] shrink-0 text-moss" strokeWidth={2.6} />
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PanelShell
        eyebrow="Stage 4 · logistics"
        title="Book the handover"
        intro={
          <NextStep>
            choose how the food travels and when it is handed over. The app only offers windows that land
            before {shortTime(item.expiresAt)}, then the load moves to “pickup scheduled”.
          </NextStep>
        }
        footer={
          <>
            <button
              className="btn btn-primary"
              disabled={!plan.onTime}
              onClick={() =>
                dispatch({
                  type: 'SCHEDULE_PICKUP',
                  itemId: item.id,
                  method,
                  driverId: method === 'volunteer_driver' ? driverId || undefined : undefined,
                  scheduledFor,
                  note: note.trim() || undefined,
                })
              }
            >
              Confirm pickup <ArrowRight size={14} />
            </button>
            <span className="data text-[0.7rem] text-ink-3">
              arrives ≈ {shortTime(plan.arrivalAt)} · {plan.slackMinutes >= 0 ? `${durationLabel(plan.slackMinutes)} before expiry` : 'after expiry'}
            </span>
          </>
        }
      >
        <div className="grid gap-2.5 sm:grid-cols-3">
          {methods.map((m) => {
            const Icon = m === 'recipient_pickup' ? Users : m === 'volunteer_driver' ? Truck : Store;
            const active = method === m;
            return (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`rounded-[3px] border p-3 text-left transition-colors ${
                  active ? 'border-ink bg-ink/[0.05]' : 'border-ink/18 hover:border-ink/40'
                }`}
              >
                <Icon size={16} className={active ? 'text-ink' : 'text-ink-3'} />
                <div className="mt-2 text-[0.8rem] font-semibold">{PICKUP_METHODS[m].label}</div>
                <div className="mt-0.5 text-[0.7rem] leading-snug text-ink-3">{PICKUP_METHODS[m].hint}</div>
              </button>
            );
          })}
        </div>

        <AnimatePresence initial={false}>
          {method === 'volunteer_driver' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 0.8, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-4 border-t border-ink/12 pt-4">
                <div className="eyebrow mb-2 text-ink-3">On-shift drivers</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {state.drivers.map((d) => {
                    const fit =
                      d.onShift && d.capacityKg >= item.quantityKg && (!(item.storage !== 'ambient') || d.refrigerated);
                    const active = driverId === d.id;
                    return (
                      <button
                        key={d.id}
                        onClick={() => setDriverId(d.id)}
                        disabled={!d.onShift}
                        className={`flex items-start gap-3 rounded-[3px] border p-3 text-left transition-colors disabled:opacity-40 ${
                          active ? 'border-ink bg-ink/[0.05]' : 'border-ink/18 hover:border-ink/40'
                        }`}
                      >
                        <span
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-semibold"
                          style={{
                            background: fit ? 'var(--color-moss)' : 'rgba(22,19,12,0.12)',
                            color: fit ? 'var(--color-paper)' : 'var(--color-ink-3)',
                          }}
                        >
                          {d.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[0.8rem] font-semibold">{d.name}</span>
                          <span className="data block text-[0.65rem] text-ink-3">
                            {d.vehicle} · responds ~{d.avgResponseMinutes} min
                          </span>
                          {!fit && d.onShift && (
                            <span className="mt-1 block text-[0.65rem] text-vermillion-2">
                              {d.capacityKg < item.quantityKg
                                ? 'Capacity too small for this load'
                                : 'Not refrigerated'}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4 border-t border-ink/12 pt-4">
          <div className="eyebrow mb-2 text-ink-3">Handover window</div>
          {!anyWindowFits && (
            <p className="mb-3 flex items-start gap-2 rounded-[3px] border border-vermillion/40 bg-vermillion/[0.06] px-3 py-2 text-[0.75rem] leading-snug text-vermillion-2">
              <AlertTriangle size={13} className="mt-[2px] shrink-0" />
              With this method and driver, no window lands before {shortTime(item.expiresAt)}. Switch the
              method, pick a different driver, or the load will be recorded as waste when the clock runs out.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {options.map((t) => {
              const active = scheduledFor === t;
              const p = planFor(t);
              return (
                <button
                  key={t}
                  onClick={() => setScheduledFor(t)}
                  disabled={!p.onTime}
                  className={`data rounded-[3px] border px-3 py-2 text-[0.75rem] transition-colors disabled:opacity-35 ${
                    active ? 'border-ink bg-ink text-paper' : 'border-ink/20 hover:border-ink/40'
                  }`}
                >
                  {shortTime(t)}
                  <span className={`ml-1.5 text-[0.62rem] ${active ? 'text-paper/70' : 'text-ink-4'}`}>
                    → {shortTime(p.arrivalAt)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 space-y-1.5">
            {plan.problems.map((p) => (
              <p key={p} className="flex items-start gap-2 text-[0.75rem] text-vermillion-2">
                <AlertTriangle size={13} className="mt-[2px] shrink-0" /> {p}
              </p>
            ))}
            {plan.warnings.map((w) => (
              <p key={w} className="flex items-start gap-2 text-[0.75rem] text-amber">
                <Info size={13} className="mt-[2px] shrink-0" /> {w}
              </p>
            ))}
          </div>

          <label className="mt-4 block">
            <span className="eyebrow text-ink-3">Handover note (optional)</span>
            <input
              className="field mt-1.5"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Bay 2, ask for the duty manager…"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.72rem] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <Timer size={12} /> {durationLabel(slack)} of clock remaining
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Route size={12} /> {durationLabel(plan.leadMinutes)} door-to-door
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Scale size={12} /> {kg(item.quantityKg)} on board
            </span>
          </div>
        </div>
      </PanelShell>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Booked / in transit / delivered / expired                                 */
/* -------------------------------------------------------------------------- */

function BookedPanel({ item }: { item: SurplusItem }) {
  const { state, dispatch, recipientById, driverById, donorById } = useStore();
  const recipient = recipientById.get(item.match!.recipientId)!;
  const pickup = item.pickup!;
  const driver = pickup.driverId ? driverById.get(pickup.driverId) : undefined;
  const donor = donorById.get(item.donorId)!;
  const km = distanceKm(donor.coords, recipient.coords);
  const dueIn = (pickup.scheduledFor - state.now) / 60000;
  const overdue = dueIn < 0;

  return (
    <PanelShell
      eyebrow="Stage 5 · handover"
      title={overdue ? 'Pickup is running late' : `Collection at ${shortTime(pickup.scheduledFor)}`}
      intro={
        <NextStep>
          once the food has actually left the donor, press “mark as picked up”. The load then sits in
          transit until you confirm it arrived.
        </NextStep>
      }
      footer={
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'MARK_PICKED_UP', itemId: item.id })}>
          <ClipboardCheck size={14} /> Mark as picked up
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <dl className="space-y-0">
          <Row label="Method" value={PICKUP_METHODS[pickup.method].label} />
          <Row label="Recipient" value={recipient.organization} />
          <Row
            label="Driver"
            value={driver ? `${driver.name} · ${driver.vehicle}` : 'Recipient vehicle'}
          />
          <Row label="Distance" value={`${km.toFixed(1)} km · ${durationLabel(travelMinutes(km))}`} />
          <Row
            label={overdue ? 'Overdue by' : 'Collection in'}
            value={overdue ? durationLabel(-dueIn) : durationLabel(dueIn)}
          />
        </dl>
        <HandoverChecklist item={item} />
      </div>
      {pickup.note && <p className="mt-3 data text-[0.72rem] text-ink-3">Note · {pickup.note}</p>}
    </PanelShell>
  );
}

function noteLine(item: SurplusItem) {
  return item.storage === 'frozen' ? 'Keep frozen blocks solid, no partial thaw' : 'Log any rejected items back to the donor';
}

/** The handover protocol, tickable at the door — a real door-check, not decoration. */
function HandoverChecklist({ item }: { item: SurplusItem }) {
  const lines = [
    `Confirm ${item.packaging} are stacked and sealed`,
    item.storage !== 'ambient'
      ? 'Probe temperature still below 4°C at the door'
      : 'Keep loads dry and off the floor',
    `Record the handover against ${item.code}`,
    noteLine(item),
  ];
  const [done, setDone] = useState<number[]>([]);

  return (
    <div className="rounded-[3px] border border-ink/15 bg-ink/[0.035] p-4">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow text-ink-3">Handover checklist</span>
        <span className="data text-[0.62rem] text-ink-4">
          {done.length}/{lines.length} confirmed
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {lines.map((line, i) => {
          const ticked = done.includes(i);
          return (
            <li key={line}>
              <button
                onClick={() => setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))}
                className="flex w-full items-start gap-2 text-left"
              >
                <span
                  className={`mt-[1px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[2px] border transition-colors ${
                    ticked ? 'border-moss bg-moss text-paper' : 'border-ink/30 text-transparent'
                  }`}
                >
                  <Check size={10} strokeWidth={3.4} />
                </span>
                <span
                  className={`text-[0.77rem] leading-snug transition-colors ${
                    ticked ? 'text-ink-4 line-through decoration-ink/30' : 'text-ink-2'
                  }`}
                >
                  {line}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function InTransitPanel({ item }: { item: SurplusItem }) {
  const { state, dispatch, recipientById, donorById } = useStore();
  const recipient = recipientById.get(item.match!.recipientId)!;
  const before = recipient.currentIntakeKg;
  const after = useCountUp(before + item.quantityKg, 600);
  const meals = item.quantityKg * CATEGORY[item.category].mealsPerKg;

  return (
    <PanelShell
      eyebrow="Stage 6 · delivery"
      title={`${kg(item.quantityKg)} in transit`}
      intro={
        <NextStep>
          confirm delivery the moment the recipient takes the food. That is the single step that writes
          this load into the impact ledger as meals and kilos rescued.
        </NextStep>
      }
      footer={
        <>
          <button className="btn btn-urgent" onClick={() => dispatch({ type: 'MARK_DELIVERED', itemId: item.id })}>
            <Check size={14} /> Mark delivered to {recipient.organization}
          </button>
          <span className="data text-[0.7rem] text-ink-3">
            logs ≈ {Math.round(meals)} meals · {kgPrecise(item.quantityKg)} rescued
          </span>
        </>
      }
    >
      <p className="max-w-[60ch] text-[0.85rem] leading-relaxed text-ink-2">
        Collected from {donorById.get(item.donorId)?.name} at {shortTime(item.pickup?.pickedUpAt ?? state.now)}.
        On arrival, {Math.round(item.quantityKg)} kg will count against {recipient.organization}'s daily intake
        ceiling.
      </p>
      <div className="mt-4 rounded-[3px] border border-ink/15 bg-ink/[0.035] p-4">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow text-ink-3">Recipient intake today</span>
          <span className="data text-[0.75rem] text-ink-3">
            {Math.round(after)} / {recipient.capacityKgPerDay} kg
          </span>
        </div>
        <div className="relative mt-2 h-[10px] w-full overflow-hidden rounded-[2px] border border-ink/15 bg-ink/[0.06]">
          <div
            className="absolute inset-y-0 left-0 bg-ocean/40"
            style={{ width: `${(before / recipient.capacityKgPerDay) * 100}%` }}
          />
          <motion.div
            className="absolute inset-y-0 bg-ocean"
            initial={{ width: `${(before / recipient.capacityKgPerDay) * 100}%` }}
            animate={{ width: `${((before + item.quantityKg) / recipient.capacityKgPerDay) * 100}%` }}
            transition={{ duration: 0.6, ease: [0.22, 0.8, 0.2, 1] }}
          />
        </div>
      </div>
    </PanelShell>
  );
}

function DeliveredPanel({
  item,
  recipientName,
  meals,
}: {
  item: SurplusItem;
  recipientName: string;
  meals: number;
}) {
  const { dispatch } = useStore();
  const animatedMeals = useCountUp(meals, 900);
  const animatedKg = useCountUp(item.quantityKg, 900);

  return (
    <section className="sheet relative overflow-hidden rounded-[3px] p-5 sm:p-7">
      <motion.div
        initial={{ scale: 1.6, opacity: 0, rotate: -22 }}
        animate={{ scale: 1, opacity: 0.9, rotate: -8 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        className="stamp absolute right-5 top-6 text-moss"
      >
        Rescued
      </motion.div>

      <div className="eyebrow text-ink-3">Stage 6 complete · impact recorded</div>
      <h2 className="display mt-1 max-w-[20ch] text-[2rem] leading-[1.03]">
        This load became food, not waste.
      </h2>
      <p className="mt-2 max-w-[62ch] text-[0.82rem] leading-relaxed text-ink-2">
        Delivery is the last stage — nothing is outstanding on this load. It now sits in the closed
        section of the triage board, and its meals and kilos are counted in the impact ledger.
      </p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-[3px] border border-moss/35 bg-moss/[0.08] p-4"
        >
          <div className="eyebrow text-moss">Meals recovered</div>
          <div className="data mt-1 text-[2.4rem] leading-none text-moss">{Math.round(animatedMeals)}</div>
          <div className="data mt-1 text-[0.68rem] text-ink-3">
            {kgPrecise(animatedKg)} of {CATEGORY[item.category].label.toLowerCase()} at{' '}
            {CATEGORY[item.category].mealsPerKg} meals/kg
          </div>
        </motion.div>
        <div className="rounded-[3px] border border-ink/15 bg-ink/[0.035] p-4">
          <Row label="Recipient" value={recipientName} />
          <Row label="Delivered" value={item.deliveredAt ? shortTime(item.deliveredAt) : '—'} />
          <Row label="Manifest" value={item.code} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink/12 pt-4">
        <button
          className="btn btn-primary"
          onClick={() => dispatch({ type: 'NAVIGATE', view: { name: 'triage' } })}
        >
          Back to triage <ArrowRight size={14} />
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'NAVIGATE', view: { name: 'impact' } })}>
          See the impact ledger
        </button>
      </div>
    </section>
  );
}

function ExpiredPanel({
  item,
  nearest,
  donorName,
  now,
}: {
  item: SurplusItem;
  nearest?: Recommendation;
  donorName: string;
  now: number;
}) {
  const { dispatch } = useStore();
  const meals = item.quantityKg * CATEGORY[item.category].mealsPerKg;

  return (
    <section className="sheet relative overflow-hidden rounded-[3px] p-5 sm:p-7">
      <span className="absolute inset-x-0 top-0 h-[3px] bg-vermillion-2" />
      <div className="eyebrow text-vermillion-2">Outcome · waste</div>
      <h2 className="display mt-1 max-w-[22ch] text-[2rem] leading-[1.03]">The window closed.</h2>
      <p className="mt-3 max-w-[62ch] text-[0.85rem] leading-relaxed text-ink-2">
        {item.expiredReason ?? 'No recipient was confirmed inside the safe redistribution window.'} {donorName}{' '}
        held it until {shortTime(item.expiresAt)}; after that it could not legally be passed on.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[3px] border border-vermillion/35 bg-vermillion/[0.07] p-4">
          <div className="eyebrow text-vermillion-2">Recorded as waste</div>
          <div className="data mt-1 text-[1.8rem] leading-none text-vermillion-2">{kg(item.quantityKg)}</div>
        </div>
        <div className="rounded-[3px] border border-ink/15 bg-ink/[0.035] p-4">
          <div className="eyebrow text-ink-3">Meals not served</div>
          <div className="data mt-1 text-[1.8rem] leading-none text-ink-2">{Math.round(meals)}</div>
        </div>
        <div className="rounded-[3px] border border-ink/15 bg-ink/[0.035] p-4">
          <div className="eyebrow text-ink-3">Expired</div>
          <div className="data mt-1 text-[1.8rem] leading-none text-ink-2">
            {item.expiredAt ? shortTime(item.expiredAt) : shortTime(item.expiresAt)}
          </div>
        </div>
      </div>

      {nearest && (
        <div className="mt-5 rounded-[3px] border border-ink/15 bg-paper-2/60 p-4">
          <div className="eyebrow text-ink-3">What was available</div>
          <p className="mt-1.5 text-[0.82rem] leading-relaxed text-ink-2">
            {nearest.recipient.organization} was a workable recipient — {nearest.distanceKm.toFixed(1)} km away
            with {Math.round(nearest.availableKg)} kg of intake free, needing about{' '}
            {durationLabel(nearest.requiredMinutes)} to complete. The decision never got made in time.
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink/12 pt-4">
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'NAVIGATE', view: { name: 'triage' } })}>
          Back to triage <ArrowRight size={14} />
        </button>
        <span className="data text-[0.7rem] text-ink-3">
          logged {relativeShort(item.expiredAt ?? now, now)}
        </span>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dossier sidebar                                                           */
/* -------------------------------------------------------------------------- */

function Dossier({ item, urgency }: { item: SurplusItem; urgency: Urgency }) {
  const { state, donorById, recipientById, driverById } = useStore();
  const donor = donorById.get(item.donorId)!;
  const cat = CATEGORY[item.category];
  const recipient = item.match ? recipientById.get(item.match.recipientId) : undefined;
  const driver = item.pickup?.driverId ? driverById.get(item.pickup.driverId) : undefined;
  const windowMinutes = (item.expiresAt - item.reportedAt) / 60000;
  const itemLog = state.log.filter((entry) => entry.itemId === item.id).slice(0, 6);
  const used = expiryProgress(item, state.now);

  return (
    <aside className="space-y-4">
      <section className="sheet rounded-[3px] p-4">
        <div className="eyebrow text-ink-3">Clock</div>
        <div className="mt-2 mb-1 h-[6px] w-full overflow-hidden rounded-[2px] bg-ink/10">
          <motion.div
            className="h-full"
            style={{ background: URGENCY[urgency.level].hex }}
            animate={{ width: `${used * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <div className="data flex justify-between text-[0.6rem] uppercase tracking-wider text-ink-4">
          <span>reported {shortTime(item.reportedAt)}</span>
          <span>expires {shortTime(item.expiresAt)}</span>
        </div>
        <div className="mt-3">
          <Row label="Window length" value={durationLabel(windowMinutes)} />
          <Row label="Still to run" value={countdown(urgency.hoursRemaining)} />
          <Row label="Urgency score" value={`${urgency.score} / 100 · ${URGENCY[urgency.level].label}`} />
        </div>
      </section>

      <section className="sheet rounded-[3px] p-4">
        <div className="eyebrow text-ink-3">Donor</div>
        <h3 className="display mt-1 text-[1.15rem] leading-tight">{donor.name}</h3>
        <p className="mt-1 text-[0.75rem] text-ink-3">
          {donor.type} · {donor.neighborhood}
        </p>
        <div className="mt-3">
          <Row label="Address" value={donor.address} />
          <Row label="Contact" value={`${donor.contact} · ${donor.phone}`} />
          <Row label="Weekly surplus" value={kg(donor.weeklySurplusKg)} />
        </div>
        <p className="mt-3 border-t border-ink/12 pt-3 text-[0.74rem] leading-relaxed text-ink-3">
          {donor.notes}
        </p>
      </section>

      <section className="sheet rounded-[3px] p-4">
        <div className="eyebrow text-ink-3">Storage & handling</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StorageChip storage={item.storage} />
          <span className="chip" style={{ color: cat.hex, borderColor: `${cat.hex}44` }}>
            {Math.round(cat.perishability * 100)}% perishable
          </span>
        </div>
        <p className="mt-3 text-[0.76rem] leading-relaxed text-ink-2">{cat.safety}</p>
        {item.handlingNote && (
          <p className="mt-3 border-t border-ink/12 pt-3 text-[0.76rem] leading-relaxed text-ink-3">
            {item.handlingNote}
          </p>
        )}
      </section>

      {recipient && (
        <section className="sheet rounded-[3px] p-4">
          <div className="eyebrow text-ink-3">Confirmed recipient</div>
          <h3 className="display mt-1 text-[1.15rem] leading-tight">{recipient.organization}</h3>
          <p className="mt-1 text-[0.75rem] text-ink-3">
            {recipient.type} · {recipient.neighborhood}
          </p>
          <div className="mt-3">
            <Row label="Match score" value={`${item.match?.score ?? 0} / 100`} />
            <Row label="Contact" value={`${recipient.contact} · ${recipient.phone}`} />
            {item.pickup && <Row label="Method" value={PICKUP_METHODS[item.pickup.method].label} />}
            {item.pickup && <Row label="Collection" value={shortTime(item.pickup.scheduledFor)} />}
            {driver && <Row label="Driver" value={driver.name} />}
          </div>
          {recipient.needs[item.category] && (
            <p className="mt-3 border-t border-ink/12 pt-3 text-[0.74rem] text-ink-3">
              Declared need for {CATEGORY[item.category].label.toLowerCase()}:{' '}
              <span style={{ color: NEED[recipient.needs[item.category]!].hex }}>
                {NEED[recipient.needs[item.category]!].label.toLowerCase()}
              </span>
            </p>
          )}
        </section>
      )}

      <section className="sheet rounded-[3px] p-4">
        <div className="eyebrow text-ink-3">This load's history</div>
        <ol className="mt-3 space-y-3">
          {itemLog.length === 0 && (
            <li className="text-[0.75rem] text-ink-4">No entries yet beyond intake.</li>
          )}
          {itemLog.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span className="data mt-[3px] w-[2.6rem] shrink-0 text-[0.62rem] text-ink-4">
                {shortTime(entry.at)}
              </span>
              <span className="border-l border-ink/15 pl-3 text-[0.74rem] leading-snug text-ink-2">
                {entry.message}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small bits                                                                */
/* -------------------------------------------------------------------------- */

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="sheet-sunk rounded-[3px] px-3 py-2">
      <div className="eyebrow text-ink-3">{label}</div>
      <div className="data mt-1 text-[0.95rem]">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink/10 py-1.5 last:border-0">
      <span className="eyebrow shrink-0 text-ink-3">{label}</span>
      <span className="text-right text-[0.75rem] leading-snug text-ink-2">{value}</span>
    </div>
  );
}

function Contribution({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  return (
    <div>
      <div className="data text-[0.58rem] uppercase tracking-wider text-ink-4">{label}</div>
      <div className="mt-1 h-[5px] w-full rounded-[2px] bg-ink/10">
        <motion.div
          className="h-full rounded-[2px]"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, (value / max) * 100)}%` }}
          transition={{ duration: 0.7, ease: [0.22, 0.8, 0.2, 1] }}
        />
      </div>
      <div className="data mt-0.5 text-[0.68rem] text-ink-2">
        {value.toFixed(1)} <span className="text-ink-4">of {max}</span>
      </div>
    </div>
  );
}