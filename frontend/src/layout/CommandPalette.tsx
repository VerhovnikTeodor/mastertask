import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSearch } from '../api/hooks';
import { useDebounced } from '../lib/useDebounced';
import { Avatar, Kbd, Spinner, cx } from '../components/ui';
import { Icon } from '../components/Icon';
import { fullName } from '../lib/format';
import { PROJECT_STATUS_LABEL } from '../lib/meta';
import type { ProjectStatus } from '../lib/types';
import { useTaskDrawer, useWorkspace } from './workspace';

interface Result {
  id: string;
  group: string;
  title: string;
  meta?: string;
  lead: React.ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const { searchOpen, closeSearch, openComposer } = useWorkspace();
  if (!searchOpen) return null;
  return <Palette onClose={closeSearch} openComposer={openComposer} />;
}

function Palette({ onClose, openComposer }: { onClose: () => void; openComposer: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query.trim(), 160);
  const search = useSearch(debounced);
  const navigate = useNavigate();
  const { openTask } = useTaskDrawer();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const results = useMemo<Result[]>(() => {
    if (!debounced) {
      return [
        { id: 'a-new', group: 'Hitra dejanja', title: 'Ustvari novo nalogo', meta: 'C', lead: <Icon name="plus" />, run: go(() => openComposer()) },
        { id: 'a-mine', group: 'Hitra dejanja', title: 'Moje naloge', meta: 'G M', lead: <Icon name="checklist" />, run: go(() => navigate('/tasks?assignee=me')) },
        { id: 'a-overdue', group: 'Hitra dejanja', title: 'Zamujene naloge', lead: <Icon name="bolt" />, run: go(() => navigate('/tasks?due=overdue')) },
        { id: 'a-projects', group: 'Hitra dejanja', title: 'Vsi projekti', meta: 'G P', lead: <Icon name="folder" />, run: go(() => navigate('/projects')) },
        { id: 'a-new-project', group: 'Hitra dejanja', title: 'Nov projekt', lead: <Icon name="plus" />, run: go(() => navigate('/projects?new=1')) },
        { id: 'a-calendar', group: 'Hitra dejanja', title: 'Koledar rokov', meta: 'G K', lead: <Icon name="calendar" />, run: go(() => navigate('/calendar')) },
      ];
    }
    const data = search.data;
    if (!data) return [];
    return [
      ...data.tasks.map((t) => ({
        id: `t-${t.id}`,
        group: 'Naloge',
        title: t.title,
        meta: `${t.key} · ${t.status.name}${t.archived ? ' · arhivirana' : ''}`,
        lead: <span className="palette-dot" style={{ background: t.project.color }} />,
        run: go(() => openTask(t.id)),
      })),
      ...data.projects.map((p) => ({
        id: `p-${p.id}`,
        group: 'Projekti',
        title: p.name,
        meta: `${p.key} · ${p.archived ? 'Arhiviran' : PROJECT_STATUS_LABEL[p.status as ProjectStatus]}`,
        lead: <span className="palette-square" style={{ background: p.color }} />,
        run: go(() => navigate(`/projects/${p.id}`)),
      })),
      ...data.people.map((u) => ({
        id: `u-${u.id}`,
        group: 'Ljudje',
        title: fullName(u),
        meta: u.jobTitle ?? u.email,
        lead: <Avatar user={u} size={20} />,
        run: go(() => navigate(`/team/${u.id}`)),
      })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, search.data]);

  useEffect(() => setActive(0), [debounced]);
  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[active]?.run();
    }
  };

  let lastGroup = '';
  return createPortal(
    <div className="overlay overlay-palette" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Globalno iskanje" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Išči naloge, projekte in ljudi … (npr. WEB-12)"
            aria-label="Iskalni niz"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
          />
          {search.isFetching && debounced && <Spinner size={14} />}
          <Kbd>Esc</Kbd>
        </div>
        <div className="palette-results" id="palette-results" ref={listRef} role="listbox">
          {debounced && !search.isFetching && results.length === 0 && (
            <div className="palette-empty">
              <strong>Ni zadetkov za »{debounced}«</strong>
              <span>Poskusite z drugim izrazom ali oznako naloge.</span>
            </div>
          )}
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <div key={r.id}>
                {header && <div className="palette-group">{header}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={cx('palette-item', i === active && 'is-active')}
                  onMouseMove={() => setActive(i)}
                  onClick={r.run}
                >
                  <span className="palette-lead">{r.lead}</span>
                  <span className="grow truncate">{r.title}</span>
                  {r.meta && <span className="palette-meta">{r.meta}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-footer">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> premik</span>
          <span><Kbd>Enter</Kbd> odpri</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
