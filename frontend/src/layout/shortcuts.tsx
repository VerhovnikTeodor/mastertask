import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../components/overlays';
import { Kbd } from '../components/ui';
import { useWorkspace } from './workspace';

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: 'Globalno iskanje' },
  { keys: ['/'], label: 'Globalno iskanje' },
  { keys: ['C'], label: 'Nova naloga' },
  { keys: ['G', 'D'], label: 'Nadzorna plošča' },
  { keys: ['G', 'M'], label: 'Moje naloge' },
  { keys: ['G', 'T'], label: 'Vse naloge' },
  { keys: ['G', 'P'], label: 'Projekti' },
  { keys: ['G', 'K'], label: 'Koledar' },
  { keys: ['G', 'E'], label: 'Ekipa' },
  { keys: ['?'], label: 'Prikaži bližnjice' },
  { keys: ['Esc'], label: 'Zapri okno ali panel' },
];

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const { openSearch, openComposer, openShortcuts } = useWorkspace();
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;

      const key = e.key.toLowerCase();
      if (pendingG.current) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const routes: Record<string, string> = {
          d: '/',
          m: '/tasks?assignee=me',
          t: '/tasks',
          p: '/projects',
          k: '/calendar',
          e: '/team',
        };
        if (routes[key]) {
          e.preventDefault();
          navigate(routes[key]);
        }
        return;
      }
      if (key === 'g') {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 900);
      } else if (key === '/') {
        e.preventDefault();
        openSearch();
      } else if (key === 'c') {
        e.preventDefault();
        openComposer();
      } else if (e.key === '?') {
        e.preventDefault();
        openShortcuts();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, openSearch, openComposer, openShortcuts]);
}

export function ShortcutsDialog() {
  const { shortcutsOpen, closeShortcuts } = useWorkspace();
  return (
    <Modal open={shortcutsOpen} onClose={closeShortcuts} title="Bližnjice na tipkovnici" size="sm">
      <ul className="shortcut-list">
        {SHORTCUTS.map((s) => (
          <li key={s.label + s.keys.join()}>
            <span>{s.label}</span>
            <span className="row gap-1">
              {s.keys.map((k, i) => (
                <span key={k + i} className="row gap-1">
                  {i > 0 && s.keys[0] === 'G' && <span className="muted">nato</span>}
                  <Kbd>{k}</Kbd>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
