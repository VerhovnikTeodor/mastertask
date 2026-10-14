import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../components/overlays';
import { Button, Input, Field } from '../components/ui';
import { Icon } from '../components/Icon';
import { errorMessage } from '../lib/api';

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  /** Uporabnik mora vpisati to besedilo (za nepovratna dejanja). */
  typeToConfirm?: string;
}

interface FeedbackContextValue {
  toast: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (error: unknown, title?: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.tone === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );

  const value = useMemo<FeedbackContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (err, title = 'Dejanje ni uspelo') => toast({ tone: 'error', title, description: errorMessage(err) }),
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          setTyped('');
          setConfirmState({ ...options, resolve });
        }),
    }),
    [toast],
  );

  const closeConfirm = (result: boolean) => {
    confirmState?.resolve(result);
    setConfirmState(null);
  };
  const typedOk = !confirmState?.typeToConfirm || typed.trim() === confirmState.typeToConfirm;

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span className="toast-indicator" aria-hidden="true" />
            <div className="toast-body">
              <strong>{t.title}</strong>
              {t.description && <p>{t.description}</p>}
            </div>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="toast-close" aria-label="Zapri obvestilo" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
      <Modal
        open={Boolean(confirmState)}
        onClose={() => closeConfirm(false)}
        title={confirmState?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => closeConfirm(false)}>
              Prekliči
            </Button>
            <Button
              variant={confirmState?.tone === 'primary' ? 'primary' : 'danger'}
              disabled={!typedOk}
              onClick={() => closeConfirm(true)}
              data-autofocus={confirmState?.typeToConfirm ? undefined : true}
            >
              {confirmState?.confirmLabel ?? 'Potrdi'}
            </Button>
          </>
        }
      >
        {confirmState?.description && <div className="confirm-text">{confirmState.description}</div>}
        {confirmState?.typeToConfirm && (
          <Field label={`Za potrditev vpišite »${confirmState.typeToConfirm}«`} htmlFor="confirm-input">
            <Input
              id="confirm-input"
              data-autofocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              onKeyDown={(e) => e.key === 'Enter' && typedOk && closeConfirm(true)}
            />
          </Field>
        )}
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback mora biti znotraj FeedbackProvider');
  return ctx;
}
