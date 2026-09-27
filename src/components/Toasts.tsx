import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/AppStore';

const TONE: Record<string, string> = {
  ink: 'var(--color-ink)',
  moss: 'var(--color-moss)',
  vermillion: 'var(--color-vermillion)',
  ocean: 'var(--color-ocean)',
};

export function Toasts() {
  const { state, dispatch } = useStore();

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 lg:bottom-6 lg:right-6">
      <AnimatePresence initial={false}>
        {state.toasts.map((t) => (
          <ToastCard
            key={t.id}
            id={t.id}
            tone={t.tone}
            title={t.title}
            detail={t.detail}
            onDismiss={(id) => dispatch({ type: 'DISMISS_TOAST', id })}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  id,
  tone,
  title,
  detail,
  onDismiss,
}: {
  id: string;
  tone: string;
  title: string;
  detail?: string;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(id), 5200);
    return () => window.clearTimeout(t);
  }, [id, onDismiss]);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.28, ease: [0.22, 0.8, 0.2, 1] }}
      onClick={() => onDismiss(id)}
      className="pointer-events-auto overflow-hidden rounded-[3px] border border-ink/20 bg-paper text-left shadow-[0_18px_40px_-24px_rgba(22,19,12,0.85)]"
    >
      <div className="flex">
        <span className="w-[3px] shrink-0" style={{ background: TONE[tone] ?? TONE.ink }} />
        <div className="px-3 py-2.5">
          <div className="text-[0.78rem] font-semibold tracking-tight" style={{ color: TONE[tone] }}>
            {title}
          </div>
          {detail && <div className="mt-0.5 text-[0.72rem] leading-snug text-ink-2">{detail}</div>}
        </div>
      </div>
      <motion.span
        className="block h-[2px] w-full origin-left"
        style={{ background: TONE[tone] ?? TONE.ink, opacity: 0.4 }}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: 5.2, ease: 'linear' }}
      />
    </motion.button>
  );
}
