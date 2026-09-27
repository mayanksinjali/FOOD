import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from './components/AppShell';
import { useStore } from './store/AppStore';
import { TriageBoard } from './views/TriageBoard';
import { WorkflowView } from './views/WorkflowView';
import { RecipientsView } from './views/RecipientsView';
import { ImpactView } from './views/ImpactView';

export default function App() {
  const { state } = useStore();

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        <motion.div
          key={state.view.name === 'workflow' ? `workflow-${state.view.itemId}` : state.view.name}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.26, ease: [0.22, 0.8, 0.2, 1] }}
        >
          {state.view.name === 'triage' && <TriageBoard />}
          {state.view.name === 'workflow' && state.view.itemId && (
            <WorkflowView itemId={state.view.itemId} />
          )}
          {state.view.name === 'recipients' && <RecipientsView />}
          {state.view.name === 'impact' && <ImpactView />}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
