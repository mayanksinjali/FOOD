/* Render smoke test:
   npx esbuild scripts/ssr.tsx --bundle --platform=node --format=esm --jsx=automatic --outfile=/tmp/ssr.mjs --loader:.css=empty && node /tmp/ssr.mjs
*/
import { renderToString } from 'react-dom/server';
import { AppStoreProvider, appReducer, createInitialState } from '../src/store/AppStore';
import { EPOCH } from '../src/data/mock';
import App from '../src/App';
import { TriageBoard } from '../src/views/TriageBoard';
import { WorkflowView } from '../src/views/WorkflowView';
import { RecipientsView } from '../src/views/RecipientsView';
import { ImpactView } from '../src/views/ImpactView';

let failures = 0;
const check = (label: string, fn: () => string, expect: string) => {
  try {
    const html = fn();
    const pass = html.includes(expect);
    if (!pass) failures++;
    console.log(`${pass ? '  ok  ' : ' FAIL '} ${label} (${html.length} bytes)`);
  } catch (err) {
    failures++;
    console.log(` FAIL  ${label} threw: ${(err as Error).message}`);
  }
};

const wrap = (node: React.ReactNode) => () => renderToString(<AppStoreProvider>{node}</AppStoreProvider>);

check('triage board renders the masthead', wrap(<TriageBoard />), 'What needs a decision');
check('triage board renders the expiry horizon', wrap(<TriageBoard />), 'Expiry horizon');
check('workflow renders a reported load', wrap(<WorkflowView itemId="sf-2419" />), 'Run the matching engine');
check('workflow renders the urgency breakdown', wrap(<WorkflowView itemId="sf-2419" />), 'Perishability');
check('workflow renders a booked pickup', wrap(<WorkflowView itemId="sf-2402" />), 'Mark as picked up');
check('workflow renders an in-transit load', wrap(<WorkflowView itemId="sf-2398" />), 'in transit');
check('workflow renders a delivered load', wrap(<WorkflowView itemId="sf-2385" />), 'This load became food, not waste');
check('workflow renders an expired load honestly', wrap(<WorkflowView itemId="sf-2379" />), 'The window closed');
check('recipients directory renders', wrap(<RecipientsView />), 'Who can take it');
check('impact ledger renders', wrap(<ImpactView />), 'Food that became dinner');

// Every workflow stage must render through the shared reducer without crashing.
const stages: { label: string; actions: Parameters<typeof appReducer>[1][]; expect: string }[] = [
  {
    label: 'matching stage shows ranked recommendations',
    actions: [{ type: 'RUN_MATCHING', itemId: 'sf-2419' }],
    expect: 'Who can take this load',
  },
  {
    label: 'matching stage explains disqualified recipients',
    actions: [{ type: 'RUN_MATCHING', itemId: 'sf-2419' }],
    expect: 'recipients ruled out',
  },
  {
    label: 'matched stage shows the pickup planner',
    actions: [
      { type: 'RUN_MATCHING', itemId: 'sf-2419' },
      { type: 'CONFIRM_MATCH', itemId: 'sf-2419', recipientId: 'r-saltmarket', score: 83, topScore: 91 },
    ],
    expect: 'Book the handover',
  },
  {
    label: 'booked stage shows the handover checklist',
    actions: [
      { type: 'RUN_MATCHING', itemId: 'sf-2419' },
      { type: 'CONFIRM_MATCH', itemId: 'sf-2419', recipientId: 'r-saltmarket', score: 83, topScore: 91 },
      {
        type: 'SCHEDULE_PICKUP',
        itemId: 'sf-2419',
        method: 'volunteer_driver',
        driverId: 'v-tomas',
        scheduledFor: EPOCH + 40 * 60_000,
      },
    ],
    expect: 'Handover checklist',
  },
];

for (const stage of stages) {
  let seeded = createInitialState();
  for (const action of stage.actions) seeded = appReducer(seeded, action);
  check(
    stage.label,
    () => renderToString(<AppStoreProvider initialState={seeded}><WorkflowView itemId="sf-2419" /></AppStoreProvider>),
    stage.expect,
  );
}

check('app shell renders the ops strip', wrap(<App />), 'Northgate');
check('the first-run briefing explains the product', wrap(<App />), 'Edible food usually becomes waste');
check('the briefing walks the whole flow', wrap(<App />), 'The flow every load follows');
check('the briefing offers the most urgent load', wrap(<App />), 'Start with the most urgent load');
check('the impact ledger shows seven days', wrap(<ImpactView />), 'Where the weight went');
check('the triage board explains how to read it', wrap(<TriageBoard />), 'Each row below is one load of edible food');
check('the triage board names the next action', wrap(<TriageBoard />), 'pick a recipient');
check('the horizon rail explains itself', wrap(<TriageBoard />), 'The left edge is now');
check('a reported load explains what comes next', wrap(<WorkflowView itemId="sf-2419" />), 'What happens next:');

console.log(`\n${failures === 0 ? 'ALL RENDER CHECKS PASSED' : `${failures} RENDER CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
