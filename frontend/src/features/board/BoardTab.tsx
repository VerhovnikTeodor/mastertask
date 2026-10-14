import { memo, useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useBoard, useCreateTask, useMoveTask } from '../../api/hooks';
import { useCurrentUser } from '../../context/auth';
import { useFeedback } from '../../context/feedback';
import { useTaskDrawer } from '../../layout/workspace';
import { Avatar, Button, cx, EmptyState, ErrorBlock, Input, Skeleton } from '../../components/ui';
import { FilterPicker } from '../../components/filters';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { addDays, fullName, plural, todayISO } from '../../lib/format';
import { PRIORITIES } from '../../lib/meta';
import type { BoardColumn, Task } from '../../lib/types';
import { useProjectContext } from '../projects/ProjectLayout';
import { SortableTaskCard, TaskCardBody } from './TaskCard';
import {
  EMPTY_FILTERS,
  groupByColumn,
  isFiltered,
  matchesFilters,
  resolveDrop,
  type BoardFilterState,
  type Containers,
} from './boardLogic';

export default function BoardTab() {
  const { project, canEdit, canManage } = useProjectContext();
  const me = useCurrentUser();
  const board = useBoard(project.id);
  const move = useMoveTask(project.id);
  const { openTask } = useTaskDrawer();
  const { error: showError } = useFeedback();
  const [filters, setFilters] = useState<BoardFilterState>(EMPTY_FILTERS);
  const [dragging, setDragging] = useState<Containers | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragOrigin = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const tasks = useMemo(() => board.data ?? [], [board.data]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const today = todayISO();
  const weekEnd = addDays(today, 6);
  const filtered = isFiltered(filters);
  const visibleTasks = useMemo(
    () => (filtered ? tasks.filter((t) => matchesFilters(t, filters, me.id, today, weekEnd)) : tasks),
    [tasks, filters, filtered, me.id, today, weekEnd],
  );
  const base = useMemo(() => groupByColumn(visibleTasks, project.columns), [visibleTasks, project.columns]);
  const containers = dragging ?? base;
  const totals = useMemo(() => groupByColumn(tasks, project.columns), [tasks, project.columns]);

  const findContainer = useCallback(
    (id: string, state: Containers) => (id in state ? id : Object.keys(state).find((key) => state[key].includes(id))),
    [],
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    dragOrigin.current = byId.get(String(active.id))?.columnId ?? null;
    setDragging(base);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !dragging) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    const from = findContainer(activeKey, dragging);
    const to = findContainer(overKey, dragging);
    if (!from || !to || from === to) return;
    setDragging((state) => {
      if (!state) return state;
      const source = state[from].filter((id) => id !== activeKey);
      const target = [...state[to]];
      const overIndex = target.indexOf(overKey);
      const index = overKey === to || overIndex < 0 ? target.length : overIndex;
      target.splice(index, 0, activeKey);
      return { ...state, [from]: source, [to]: target };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const state = dragging;
    setActiveId(null);
    setDragging(null);
    if (!over || !state) return;
    const activeKey = String(active.id);
    const columnId = findContainer(activeKey, state);
    if (!columnId) return;
    let order = state[columnId];
    const overKey = String(over.id);
    if (overKey !== columnId && order.includes(overKey)) {
      order = arrayMove(order, order.indexOf(activeKey), order.indexOf(overKey));
    }
    const task = byId.get(activeKey);
    if (!task) return;
    const originalOrder = base[task.columnId] ?? [];
    if (columnId === task.columnId && originalOrder.join() === order.join()) return;

    const column = project.columns.find((c) => c.id === columnId)!;
    const { index, position } = resolveDrop(tasks, activeKey, columnId, order);
    const optimistic = tasks.map((t) =>
      t.id === activeKey
        ? {
            ...t,
            columnId,
            position,
            status: { id: column.id, name: column.name, category: column.category, color: column.color },
            isOverdue: Boolean(t.dueDate && t.dueDate < today && column.category !== 'done'),
          }
        : t,
    );
    move.mutate(
      { id: activeKey, columnId, index, optimistic },
      { onError: (err) => showError(err, `Naloge ${task.key} ni bilo mogoče premakniti – vrnjena je na prejšnje mesto`) },
    );
  };

  if (board.error) return <div className="page"><ErrorBlock message={errorMessage(board.error)} onRetry={() => board.refetch()} /></div>;

  const activeTask = activeId ? byId.get(activeId) : null;

  return (
    <div className="board-page">
      <BoardToolbar
        filters={filters}
        setFilters={setFilters}
        shown={visibleTasks.length}
        total={tasks.length}
        filtered={filtered}
      />
      {board.isPending ? (
        <BoardSkeleton columns={project.columns} />
      ) : tasks.length === 0 && !canEdit ? (
        <EmptyState title="Na tabli še ni nalog" description="Ko bodo člani dodali naloge, se bodo prikazale tukaj." />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setDragging(null);
          }}
          accessibility={{
            announcements: {
              onDragStart: ({ active }) => `Premikate nalogo ${byId.get(String(active.id))?.key}.`,
              onDragOver: ({ over }) => (over ? `Nad stolpcem ${columnName(project.columns, findContainer(String(over.id), containers))}.` : ''),
              onDragEnd: ({ over }) => (over ? `Naloga odložena v stolpec ${columnName(project.columns, findContainer(String(over.id), containers))}.` : 'Premik preklican.'),
              onDragCancel: () => 'Premik preklican.',
            },
          }}
        >
          <div className="board" role="list" aria-label="Kanban tabla">
            {project.columns.map((column) => (
              <Column
                key={column.id}
                column={column}
                taskIds={containers[column.id] ?? []}
                totalCount={totals[column.id]?.length ?? 0}
                byId={byId}
                canEdit={canEdit}
                projectId={project.id}
                onOpen={openTask}
                isOrigin={Boolean(activeId) && dragOrigin.current === column.id}
                filtered={filtered}
              />
            ))}
            {canManage && (
              <Link to="settings" className="board-add-column">
                <Icon name="plus" size={15} />
                Uredi stolpce
              </Link>
            )}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
            {activeTask ? <TaskCardBody task={activeTask} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function columnName(columns: BoardColumn[], id: string | undefined) {
  return columns.find((c) => c.id === id)?.name ?? '';
}

function BoardToolbar({
  filters,
  setFilters,
  shown,
  total,
  filtered,
}: {
  filters: BoardFilterState;
  setFilters: (f: BoardFilterState | ((f: BoardFilterState) => BoardFilterState)) => void;
  shown: number;
  total: number;
  filtered: boolean;
}) {
  const { project } = useProjectContext();
  const me = useCurrentUser();
  const set = <K extends keyof BoardFilterState>(key: K, value: BoardFilterState[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const mineOnly = filters.assignees.length === 1 && filters.assignees[0] === 'me';

  return (
    <div className="board-toolbar">
      <div className="toolbar-search toolbar-search-sm">
        <Icon name="search" size={14} />
        <Input value={filters.search} onChange={(e) => set('search', e.target.value)} placeholder="Išči na tabli" aria-label="Išči naloge na tabli" />
      </div>
      <button type="button" className={cx('filter-btn', mineOnly && 'is-active')} aria-pressed={mineOnly} onClick={() => set('assignees', mineOnly ? [] : ['me'])}>
        Samo moje
      </button>
      <FilterPicker
        label="Odgovorni"
        value={filters.assignees}
        onChange={(v) => set('assignees', v)}
        options={[
          { value: 'me', label: `Jaz (${me.firstName})` },
          { value: 'none', label: 'Nedodeljeno' },
          ...project.members
            .filter((m) => m.id !== me.id)
            .map((m) => ({
              value: m.id,
              label: fullName(m),
              render: (
                <span className="row gap-2 truncate">
                  <Avatar user={m} size={18} />
                  <span className="truncate">{fullName(m)}</span>
                </span>
              ),
            })),
        ]}
      />
      <FilterPicker label="Prioriteta" value={filters.priorities} onChange={(v) => set('priorities', v)} options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
      {project.labels.length > 0 && (
        <FilterPicker label="Oznake" value={filters.labels} onChange={(v) => set('labels', v)} options={project.labels.map((l) => ({ value: l.id, label: l.name, color: l.color }))} />
      )}
      <FilterPicker
        label="Rok"
        multiple={false}
        value={filters.due ? [filters.due] : []}
        onChange={(v) => set('due', (v[0] ?? '') as BoardFilterState['due'])}
        options={[
          { value: 'overdue', label: 'Zamujene' },
          { value: 'week', label: 'V naslednjih 7 dneh' },
          { value: 'none', label: 'Brez roka' },
        ]}
      />
      {filtered && (
        <>
          <span className="toolbar-count tabular">
            {shown} od {total}
          </span>
          <button type="button" className="link-button" onClick={() => setFilters(EMPTY_FILTERS)}>
            Počisti filtre
          </button>
        </>
      )}
    </div>
  );
}

const Column = memo(function Column({
  column,
  taskIds,
  totalCount,
  byId,
  canEdit,
  projectId,
  onOpen,
  isOrigin,
  filtered,
}: {
  column: BoardColumn;
  taskIds: string[];
  totalCount: number;
  byId: Map<string, Task>;
  canEdit: boolean;
  projectId: string;
  onOpen: (id: string) => void;
  isOrigin: boolean;
  filtered: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column' } });
  const overLimit = column.wipLimit !== null && totalCount > column.wipLimit;
  const [adding, setAdding] = useState(false);

  return (
    <section
      className={cx('board-col', `board-col-${column.category}`, isOver && 'is-over', isOrigin && 'is-origin', overLimit && 'is-over-limit')}
      style={{ ['--col' as string]: column.color }}
      aria-label={`${column.name}, ${totalCount} ${plural(totalCount, ['naloga', 'nalogi', 'naloge', 'nalog'])}`}
      role="listitem"
    >
      <header className="board-col-head">
        <span className="board-col-dot" aria-hidden="true" />
        <h2 className="board-col-title truncate">{column.name}</h2>
        <span className={cx('board-col-count tabular', overLimit && 'is-warning')} title={column.wipLimit ? `Omejitev: ${column.wipLimit}` : undefined}>
          {filtered && taskIds.length !== totalCount ? `${taskIds.length}/${totalCount}` : totalCount}
          {column.wipLimit !== null && !filtered && <span className="muted"> / {column.wipLimit}</span>}
        </span>
        {canEdit && (
          <button type="button" className="icon-btn icon-btn-sm" aria-label={`Dodaj nalogo v ${column.name}`} title="Dodaj nalogo" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} />
          </button>
        )}
      </header>
      {overLimit && <p className="board-col-warning">Preseženo število nalog v delu ({column.wipLimit})</p>}
      <div ref={setNodeRef} className="board-col-body">
        {adding && <QuickAdd column={column} projectId={projectId} onClose={() => setAdding(false)} position="top" />}
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {taskIds.map((id) => {
            const task = byId.get(id);
            return task ? <SortableTaskCard key={id} task={task} onOpen={onOpen} disabled={!canEdit} /> : null;
          })}
        </SortableContext>
        {taskIds.length === 0 && !adding && (
          <div className="board-col-empty">{filtered && totalCount > 0 ? 'Ni nalog, ki ustrezajo filtrom' : canEdit ? 'Povlecite nalogo sem' : 'Ni nalog'}</div>
        )}
      </div>
      {canEdit && !adding && (
        <button type="button" className="board-col-add" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} />
          Dodaj nalogo
        </button>
      )}
    </section>
  );
});

function QuickAdd({ column, projectId, onClose }: { column: BoardColumn; projectId: string; onClose: () => void; position: 'top' }) {
  const [title, setTitle] = useState('');
  const create = useCreateTask();
  const { error } = useFeedback();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const value = title.trim();
    if (!value) return onClose();
    try {
      await create.mutateAsync({ projectId, columnId: column.id, title: value });
      setTitle('');
      inputRef.current?.focus();
    } catch (err) {
      error(err, 'Naloge ni bilo mogoče ustvariti');
    }
  };

  return (
    <form className="quick-add" onSubmit={submit}>
      <textarea
        ref={inputRef}
        autoFocus
        className="quick-add-input"
        value={title}
        maxLength={200}
        rows={2}
        placeholder="Naslov naloge …"
        aria-label={`Naslov nove naloge v stolpcu ${column.name}`}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <div className="row between">
        <span className="muted quick-add-hint">Enter za shranjevanje · Esc za preklic</span>
        <div className="row gap-1">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Prekliči
          </Button>
          <Button size="sm" variant="primary" type="submit" loading={create.isPending}>
            Dodaj
          </Button>
        </div>
      </div>
    </form>
  );
}

function BoardSkeleton({ columns }: { columns: BoardColumn[] }) {
  return (
    <div className="board">
      {columns.map((c, i) => (
        <section key={c.id} className="board-col">
          <header className="board-col-head">
            <Skeleton width={90} />
          </header>
          <div className="board-col-body">
            {Array.from({ length: 3 - (i % 2) }).map((_, j) => (
              <div key={j} className="kcard">
                <Skeleton width={50} height={10} />
                <Skeleton width="85%" />
                <Skeleton width="40%" height={10} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
