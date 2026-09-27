/* One-off verification harness for the domain logic. Run with:
   npx esbuild scripts/verify.ts --bundle --platform=node --format=esm --jsx=automatic --outfile=/tmp/verify.mjs && node /tmp/verify.mjs
*/
import { appReducer, createInitialState } from '../src/store/AppStore';
import type { AppState } from '../src/types';
import { CATEGORY } from '../src/lib/catalog';
import { computeUrgency, timePressure } from '../src/lib/urgency';
import { evaluateRecipients } from '../src/lib/matching';
import { distanceKm } from '../src/lib/geo';
import { planPickup } from '../src/lib/logistics';

let failures = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failures++;
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}`);
};

let state: AppState = createInitialState();
const send = (action: Parameters<typeof appReducer>[1]) => {
  state = appReducer(state, action);
};

console.log('\n=== 1. Triage ordering & urgency ===');
const rows = state.items
  .map((item) => ({ item, u: computeUrgency(item, state.now) }))
  .sort((a, b) => b.u.score - a.u.score);
for (const { item, u } of rows) {
  console.log(
    `${item.code}  ${String(u.score).padStart(3)}  ${u.level.padEnd(8)} ${String(Math.round(u.hoursRemaining * 60)).padStart(6)}min  ${CATEGORY[item.category].short.padEnd(8)} ${item.status}`,
  );
}
const underThree = rows.filter((r) => r.u.hoursRemaining > 0 && r.u.hoursRemaining < 3);
ok(underThree.every((r) => r.u.level === 'critical'), 'every load under 3h remaining is Critical');
ok(
  rows.find((r) => r.item.code === 'SF-2408')!.u.level === 'low',
  'long-dated pantry load is Low urgency',
);

console.log('\n=== 2. Matching for the golden-path load (SF-2419) ===');
const golden = state.items.find((i) => i.code === 'SF-2419')!;
const donor = state.donors.find((d) => d.id === golden.donorId)!;
let evaluation = evaluateRecipients(golden, donor, state.recipients, state.now);
for (const rec of evaluation.feasible) {
  console.log(
    `\n${rec.recipient.organization} — ${rec.score}/100  (${distanceKm(donor.coords, rec.recipient.coords).toFixed(1)} km)`,
  );
  for (const r of rec.reasons) console.log(`    · ${r}`);
  console.log(
    `    weights → need ${rec.breakdown.need} / distance ${rec.breakdown.distance} / capacity ${rec.breakdown.capacity} / speed ${rec.breakdown.speed} / fit ${rec.breakdown.compatibility}`,
  );
}
console.log('\nruled out:');
for (const d of evaluation.disqualified) {
  console.log(`    ✗ ${d.recipient.organization} [${d.code}] ${d.reason}`);
}
ok(evaluation.feasible.length >= 3, 'at least three feasible recipients for the lasagna');
ok(
  evaluation.disqualified.some((d) => d.code === 'capacity'),
  'at least one recipient ruled out on capacity',
);
ok(
  evaluation.disqualified.some((d) => d.code === 'storage') ||
    evaluation.disqualified.some((d) => d.code === 'category'),
  'at least one recipient ruled out on storage/category',
);
ok(
  evaluation.feasible.every((r) => r.requiredMinutes <= (golden.expiresAt - state.now) / 60000),
  'no feasible recommendation can miss the expiry window',
);

console.log('\n=== 3. Golden path: report → matching → matched → booked → picked up → delivered ===');
const mealsBefore = state.items
  .filter((i) => i.status === 'delivered')
  .reduce((s, i) => s + i.quantityKg * CATEGORY[i.category].mealsPerKg, 0);
const kgBefore = state.items.filter((i) => i.status === 'delivered').reduce((s, i) => s + i.quantityKg, 0);
const logBefore = state.log.length;

const top = evaluation.feasible[0];
const runnerUp = evaluation.feasible[1];

send({ type: 'RUN_MATCHING', itemId: golden.id });
ok(
  state.items.find((i) => i.id === golden.id)!.status === 'matching',
  'reported → matching',
);

// deliberately choose a recipient that is not the top pick, to prove the choice is real
send({
  type: 'CONFIRM_MATCH',
  itemId: golden.id,
  recipientId: runnerUp.recipient.id,
  score: runnerUp.score,
  topScore: top.score,
});
let current = state.items.find((i) => i.id === golden.id)!;
ok(current.status === 'matched', 'matching → matched');
ok(current.match!.recipientId === runnerUp.recipient.id, 'coordinator can override the top recommendation');
ok(
  state.log[0].message.includes('chose this over the top pick'),
  'the override is recorded in the activity log',
);

const kmToPickup = distanceKm(donor.coords, runnerUp.recipient.coords);
const scheduledFor = state.now + 40 * 60_000;
send({
  type: 'SCHEDULE_PICKUP',
  itemId: golden.id,
  method: 'volunteer_driver',
  driverId: 'v-tomas',
  scheduledFor,
  note: 'Bay 2',
});
current = state.items.find((i) => i.id === golden.id)!;
ok(current.status === 'pickup_scheduled', 'matched → pickup_scheduled');
ok(current.pickup!.scheduledFor === scheduledFor, 'pickup time stored from the scheduled window');
ok(
  scheduledFor + 14 * 60_000 < golden.expiresAt,
  `pickup lands before expiry (lead ${kmToPickup.toFixed(1)} km, 14 min response)`,
);

// an invalid pickup (after expiry) must be recordable but demonstrably late — check the planner
console.log('\n=== 4. Pickup validation rejects a window past expiry ===');
const badPlan = planPickup({
  method: 'volunteer_driver',
  recipient: runnerUp.recipient,
  driver: state.drivers.find((d) => d.id === 'v-tomas'),
  km: kmToPickup,
  scheduledFor: golden.expiresAt,
  expiresAt: golden.expiresAt,
  quantityKg: golden.quantityKg,
  requiresCold: true,
});
ok(!badPlan.onTime, 'a pickup scheduled at the expiry moment is rejected');
ok(badPlan.problems.length > 0, 'rejection explains why');

send({ type: 'MARK_PICKED_UP', itemId: golden.id });
ok(state.items.find((i) => i.id === golden.id)!.status === 'picked_up', 'pickup_scheduled → picked_up');

send({ type: 'MARK_DELIVERED', itemId: golden.id });
current = state.items.find((i) => i.id === golden.id)!;
ok(current.status === 'delivered', 'picked_up → delivered');
ok(!!current.deliveredAt, 'delivery timestamp recorded');

const mealsAfter = state.items
  .filter((i) => i.status === 'delivered')
  .reduce((s, i) => s + i.quantityKg * CATEGORY[i.category].mealsPerKg, 0);
const kgAfter = state.items.filter((i) => i.status === 'delivered').reduce((s, i) => s + i.quantityKg, 0);
ok(mealsAfter > mealsBefore, `meals saved rose ${Math.round(mealsBefore)} → ${Math.round(mealsAfter)}`);
ok(kgAfter > kgBefore, `kg diverted rose ${Math.round(kgBefore)} → ${Math.round(kgAfter)}`);
ok(state.log.length > logBefore, 'activity log gained entries');
ok(state.log[0].kind === 'delivered', 'newest log entry is the delivery');
const recipientAfter = state.recipients.find((r) => r.id === runnerUp.recipient.id)!;
ok(
  recipientAfter.currentIntakeKg > runnerUp.recipient.currentIntakeKg,
  'recipient intake capacity absorbed the delivery',
);

console.log('\n=== 5. Failure path: ignoring the 30-minute fruit ===');
const fruit = state.items.find((i) => i.code === 'SF-2390')!;
send({ type: 'TICK', delta: 31 * 60_000 });
const fruitAfter = state.items.find((i) => i.id === fruit.id)!;
ok(fruitAfter.status === 'expired', 'unattended load expires on its own as the clock advances');
ok(!!fruitAfter.expiredAt, 'expiry timestamp recorded');
ok(
  state.log[0].message.includes('recorded as waste'),
  'expiry is written into the ledger honestly',
);
ok(fruitAfter.quantityKg > 0, 'wasted weight is retained for the impact ledger');
ok(state.toasts.some((t) => t.tone === 'vermillion'), 'an expiry toast is raised');

console.log('\n=== 6. Ordering after resolution ===');
const openNow = state.items.filter((i) => !['delivered', 'expired'].includes(i.status));
ok(
  !openNow.some((i) => i.id === fruit.id || i.id === golden.id),
  'resolved loads leave the open board',
);
console.log(`  open loads remaining: ${openNow.length}`);

console.log('\n=== 7. Undo reverses the last step, surgically ===');
const beforeUndoMeals = state.items
  .filter((i) => i.status === 'delivered')
  .reduce((s, i) => s + i.quantityKg * CATEGORY[i.category].mealsPerKg, 0);
// captured from the evaluation made before any delivery happened
const intakeBeforeUndo = runnerUp.recipient.currentIntakeKg;
ok(state.past.length >= 5, `undo stack holds every operational step (${state.past.length})`);
ok(
  state.log.some((e) => e.kind === 'delivered' && e.itemId === golden.id),
  'the delivery is in the log before undo',
);

send({ type: 'UNDO' });
current = state.items.find((i) => i.id === golden.id)!;
ok(current.status === 'picked_up', 'undo reverses delivery back to in transit');
ok(current.deliveredAt === undefined, 'delivery timestamp cleared');
ok(
  state.recipients.find((r) => r.id === runnerUp.recipient.id)!.currentIntakeKg === intakeBeforeUndo,
  'recipient intake is given back',
);
ok(
  Math.round(
    state.items.filter((i) => i.status === 'delivered').reduce((s, i) => s + i.quantityKg * CATEGORY[i.category].mealsPerKg, 0),
  ) === Math.round(beforeUndoMeals - golden.quantityKg * CATEGORY[golden.category].mealsPerKg),
  'meals saved drops back by exactly this load',
);
ok(
  !state.log.some((e) => e.kind === 'delivered' && e.itemId === golden.id),
  'the delivery log entry is withdrawn',
);

// The important one: an unrelated load that expired after the delivery stays expired.
ok(
  state.items.find((i) => i.id === fruit.id)!.status === 'expired',
  'undo does NOT resurrect an unrelated load that expired afterwards',
);
ok(
  state.log.some((e) => e.kind === 'expired' && e.itemId === fruit.id),
  'the unrelated expiry stays in the ledger',
);

send({ type: 'UNDO' });
ok(state.items.find((i) => i.id === golden.id)!.status === 'pickup_scheduled', 'undo walks back to booked');
send({ type: 'UNDO' });
ok(state.items.find((i) => i.id === golden.id)!.status === 'matched', 'undo walks back to matched');
send({ type: 'UNDO' });
ok(state.items.find((i) => i.id === golden.id)!.status === 'matching', 'undo walks back to matching');

// Undo back to the beginning of the golden path.
let guard = 0;
while (state.past.length > 0 && guard++ < 40) send({ type: 'UNDO' });
ok(
  state.items.find((i) => i.id === golden.id)!.status === 'reported',
  'repeated undo returns the load to reported',
);
const stable = state;
send({ type: 'UNDO' });
ok(state === stable, 'undo with an empty stack is a no-op');

console.log('\n=== 8. Briefing and orientation ===');
let fresh = createInitialState();
ok(fresh.briefingOpen, 'the briefing is open on first load');
fresh = appReducer(fresh, { type: 'CLOSE_BRIEFING' });
ok(!fresh.briefingOpen, 'it can be dismissed');
fresh = appReducer(fresh, { type: 'OPEN_BRIEFING' });
ok(fresh.briefingOpen, 'and reopened from the header');
fresh = appReducer(fresh, { type: 'OPEN_ITEM', itemId: 'sf-2419' });
ok(!fresh.briefingOpen && fresh.view.name === 'workflow', 'jumping into a load closes the briefing');

console.log('\n=== 9. Urgency curve is monotonic and level-spread ===');
let monotonic = true;
let previousScore = Infinity;
for (let h = 0; h <= 96; h += 0.25) {
  const s = timePressure(h);
  if (s > previousScore + 1e-9) monotonic = false;
  previousScore = s;
}
ok(monotonic, 'time pressure never rises as more time remains');
ok(Math.abs(timePressure(3) - timePressure(3.0001)) < 0.01, 'the curve is continuous at the 3-hour boundary');
ok(timePressure(2.9) >= 82, 'under three hours the clock signal alone is near-maximal');

const seeded = createInitialState();
const levels = seeded.items
  .filter((i) => !['delivered', 'expired'].includes(i.status))
  .map((i) => computeUrgency(i, seeded.now));
const spread = new Set(levels.map((l) => l.level));
ok(spread.size >= 3, `open loads span at least three urgency levels (${[...spread].join(', ')})`);
const dairy = seeded.items.find((i) => i.code === 'SF-2411')!;
ok(
  computeUrgency(dairy, seeded.now).level === 'high',
  'a four-hour chilled load reads High, not Critical',
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
