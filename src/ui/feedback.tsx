/** Feedback primitives: empty states, skeletons, the pulse loader, toasts and dialogs. */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createStore, useStore } from '../lib/store.ts';
import { isReducedMotion } from '../systems/motion.ts';
import { sound } from '../systems/sound/engine.ts';
import { Icon, type IconName } from './Icon.tsx';

export function EmptyState({ icon = 'synapse', title, children, actions, tone = 'ichor' }: { icon?: IconName; title: string; children?: ReactNode; actions?: ReactNode; tone?: 'ichor' | 'plasma' | 'aurum' | 'haem' }) {
  return (
    <div className={`empty empty-${tone}`} role="status">
      <div className="empty-glyph" aria-hidden="true">
        <Icon name={icon} size={30} />
      </div>
      <h3 className="empty-title serif">{title}</h3>
      {children ? <div className="empty-body">{children}</div> : null}
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  );
}

export function Skeleton({ w = '100%', h = 16, r = 8 }: { w?: number | string; h?: number | string; r?: number }) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />;
}

/** The pulse loader: an EKG trace. Announces its label politely. */
export function Pulse({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="pulse" role="status" aria-live="polite">
      <svg viewBox="0 0 120 30" width="120" height="30" aria-hidden="true">
        <path d="M0 15h38l6-10 7 20 6-26 6 22 4-6h53" />
      </svg>
      <span className="kicker">{label}</span>
    </div>
  );
}

/* ───────────── Toasts ───────────── */

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
  action?: { label: string; run: () => void };
  /** Fading out: kept briefly for the exit, hidden from assistive tech. */
  leaving?: boolean;
}

const toasts = createStore<Toast[]>([]);
let seq = 0;
const LEAVE_MS = 240;

function dismiss(id: number) {
  if (isReducedMotion()) {
    toasts.set((list) => list.filter((x) => x.id !== id));
    return;
  }
  toasts.set((list) => (list.some((x) => x.id === id && !x.leaving) ? list.map((x) => (x.id === id ? { ...x, leaving: true } : x)) : list));
  window.setTimeout(() => toasts.set((list) => list.filter((x) => x.id !== id)), LEAVE_MS);
}

export function toast(message: string, opts: { tone?: Toast['tone']; action?: Toast['action']; ms?: number } = {}) {
  const t: Toast = { id: ++seq, message, tone: opts.tone ?? 'info', action: opts.action };
  toasts.set((list) => [...list.filter((x) => !x.leaving).slice(-2), t]);
  if (t.tone === 'error') sound.play('error');
  window.setTimeout(() => dismiss(t.id), opts.ms ?? (opts.action ? 7000 : 4200));
}

export function Toaster() {
  const list = useStore(toasts);
  return (
    <div className="toaster" aria-live="polite" aria-relevant="additions">
      {list.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'} data-leaving={t.leaving || undefined} aria-hidden={t.leaving || undefined}>
          <span className="toast-node" aria-hidden="true" />
          <span>{t.message}</span>
          {t.action ? (
            <button
              type="button"
              className="toast-action"
              tabIndex={t.leaving ? -1 : undefined}
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : null}
          <button type="button" className="toast-close" aria-label="Dismiss" tabIndex={t.leaving ? -1 : undefined} onClick={() => dismiss(t.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ───────────── Dialog ───────────── */

/** Matches the closing transition in skin.css. */
const DIALOG_CLOSE_MS = 200;

/**
 * Native <dialog> (showModal): real modality, inert background, Escape to close,
 * focus returns to the opener. Light-dismiss on backdrop click.
 * Closing animates (the sheet sinks and fades) and is interruptible: asked to open again
 * while it is still closing, it simply rises back. Reduced motion closes at once.
 */
export function Dialog({ open, onClose, title, children, wide, labelledBy }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; labelledBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const timer = useRef(0);
  // each dialog names itself (a shared default id would label every dialog with the first title)
  const autoId = useId();
  const titleId = labelledBy ?? `dialog-title-${autoId.replace(/[^a-z0-9]/gi, '')}`;
  const [closing, setClosing] = useState(false);

  const closeAnimated = useCallback(() => {
    const d = ref.current;
    if (!d?.open) return;
    if (isReducedMotion()) {
      d.close();
      return;
    }
    window.clearTimeout(timer.current);
    d.dataset.state = 'closing';
    setClosing(true);
    timer.current = window.setTimeout(() => d.close(), DIALOG_CLOSE_MS);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      window.clearTimeout(timer.current);
      if (d.dataset.state === 'closing') {
        delete d.dataset.state;
        setClosing(false);
      }
      if (!d.open) {
        opener.current = document.activeElement;
        d.showModal();
        sound.play('open');
      }
    } else if (d.open && d.dataset.state !== 'closing') {
      closeAnimated();
    }
  }, [open, closeAnimated]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCloseEvt = () => {
      window.clearTimeout(timer.current);
      delete d.dataset.state;
      setClosing(false);
      sound.play('close');
      onClose();
      (opener.current as HTMLElement | null)?.focus?.();
    };
    // Escape: animate instead of vanishing (if the browser lets us — otherwise it just closes)
    const onCancel = (e: Event) => {
      if (isReducedMotion()) return;
      e.preventDefault();
      closeAnimated();
    };
    d.addEventListener('close', onCloseEvt);
    d.addEventListener('cancel', onCancel);
    return () => {
      d.removeEventListener('close', onCloseEvt);
      d.removeEventListener('cancel', onCancel);
    };
  }, [onClose, closeAnimated]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === ref.current) closeAnimated();
      }}
    >
      <div className="dialog-inner">
        <header className="dialog-head">
          <h2 id={titleId} className="serif">
            {title}
          </h2>
          <button type="button" className="icon-btn btn-quiet" aria-label="Close dialog" onClick={closeAnimated}>
            <Icon name="close" />
          </button>
        </header>
        {open || closing ? children : null}
      </div>
    </dialog>
  );
}
