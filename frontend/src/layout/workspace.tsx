import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

interface ComposerOptions {
  projectId?: string;
  columnId?: string;
  dueDate?: string;
}

interface WorkspaceContextValue {
  openComposer: (options?: ComposerOptions) => void;
  closeComposer: () => void;
  composer: ComposerOptions | null;
  openSearch: () => void;
  closeSearch: () => void;
  searchOpen: boolean;
  openShortcuts: () => void;
  closeShortcuts: () => void;
  shortcutsOpen: boolean;
  /** Projekt, ki je trenutno odprt (privzet projekt za novo nalogo). */
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [composer, setComposer] = useState<ComposerOptions | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      composer,
      openComposer: (options = {}) => setComposer({ projectId: currentProjectId ?? undefined, ...options }),
      closeComposer: () => setComposer(null),
      searchOpen,
      openSearch: () => setSearchOpen(true),
      closeSearch: () => setSearchOpen(false),
      shortcutsOpen,
      openShortcuts: () => setShortcutsOpen(true),
      closeShortcuts: () => setShortcutsOpen(false),
      currentProjectId,
      setCurrentProjectId,
    }),
    [composer, searchOpen, shortcutsOpen, currentProjectId],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace mora biti znotraj WorkspaceProvider');
  return ctx;
}

/** Podrobnosti naloge so v URL-ju (?task=ID), zato je povezavo mogoče deliti in deluje gumb Nazaj. */
export function useTaskDrawer() {
  const [params, setParams] = useSearchParams();
  const taskId = params.get('task');
  const openTask = useCallback(
    (id: string) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('task', id);
        return next;
      }),
    [setParams],
  );
  const closeTask = useCallback(
    () =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('task');
        return next;
      }),
    [setParams],
  );
  return { taskId, openTask, closeTask };
}
