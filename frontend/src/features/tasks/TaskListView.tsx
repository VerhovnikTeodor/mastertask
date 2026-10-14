import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFacets, useTasks } from '../../api/hooks';
import { useCurrentUser } from '../../context/auth';
import { useTaskDrawer } from '../../layout/workspace';
import { Avatar, AvatarStack, Button, cx, EmptyState, ErrorBlock, Input, LabelChip, Select, Skeleton, Spinner } from '../../components/ui';
import { FilterPicker } from '../../components/filters';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { fullName, timeAgo } from '../../lib/format';
import { CATEGORIES, PRIORITIES } from '../../lib/meta';
import { useDebounced } from '../../lib/useDebounced';
import type { Task } from '../../lib/types';
import { DueEditor, PriorityEditor, StatusEditor } from './inlineEditors';
import { activeFilterCount, multi, readFilters, writeFilters, type FilterKey, type TaskFilterValues } from './taskFilters';

const PAGE_SIZES = [25, 50, 100];

export function TaskListView({
  fixed = {},
  hideProject,
  canEdit = true,
  emptyAction,
}: {
  fixed?: TaskFilterValues;
  hideProject?: boolean;
  canEdit?: boolean;
  emptyAction?: React.ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = PAGE_SIZES.includes(Number(params.get('size'))) ? Number(params.get('size')) : 25;
  const [search, setSearch] = useState(String(filters.search ?? ''));
  const debounced = useDebounced(search.trim(), 300);

  useEffect(() => {
    if (debounced !== (filters.search ?? '')) update({ search: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const update = (patch: TaskFilterValues) => setParams((prev) => writeFilters(prev, { ...readFilters(prev), ...patch }), { replace: true });
  const reset = () => {
    setSearch('');
    setParams((prev) => writeFilters(prev, {}), { replace: true });
  };
  const setPage = (p: number) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(p));
      return next;
    });

  const query = useMemo(
    () => ({
      ...filters,
      ...fixed,
      sort: (filters.sort as string) ?? 'updated',
      order: (filters.order as string) ?? (filters.sort === 'due' || filters.sort === 'title' || filters.sort === 'key' ? 'asc' : 'desc'),
      page,
      pageSize,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.toString(), JSON.stringify(fixed)],
  );
  const { data, isPending, isFetching, error, refetch } = useTasks(query);
  const activeCount = activeFilterCount(filters);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  useEffect(() => {
    if (data && page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, page, totalPages]);

  const sortBy = (key: string) => {
    const current = query.sort;
    const order = current === key ? (query.order === 'asc' ? 'desc' : 'asc') : key === 'due' || key === 'title' ? 'asc' : 'desc';
    update({ sort: key, order });
  };

  return (
    <div className="task-list-view">
      <FilterBar
        filters={filters}
        update={update}
        search={search}
        setSearch={setSearch}
        fixed={fixed}
        activeCount={activeCount}
        reset={reset}
        sort={query.sort}
        order={query.order}
      />

      {error ? (
        <ErrorBlock message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <TableSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState
          art={activeCount ? 'search' : 'tasks'}
          title={activeCount ? 'Ni nalog, ki bi ustrezale filtrom' : 'Tukaj še ni nalog'}
          description={activeCount ? 'Poskusite odstraniti katerega od filtrov ali spremeniti iskalni niz.' : 'Ustvarite nalogo in jo dodelite članu ekipe.'}
          action={activeCount ? <Button onClick={reset}>Ponastavi filtre</Button> : emptyAction}
        />
      ) : (
        <>
          <div className={cx('table-wrap', isFetching && 'is-refreshing')}>
            <table className="task-table">
              <thead>
                <tr>
                  <SortHeader label="Naloga" sortKey="title" current={query.sort} order={query.order} onSort={sortBy} className="col-title" />
                  {!hideProject && <th className="col-project">Projekt</th>}
                  <th className="col-status">Status</th>
                  <SortHeader label="Prioriteta" sortKey="priority" current={query.sort} order={query.order} onSort={sortBy} className="col-priority" />
                  <th className="col-assignees">Odgovorni</th>
                  <SortHeader label="Rok" sortKey="due" current={query.sort} order={query.order} onSort={sortBy} className="col-due" />
                  <SortHeader label="Posodobljeno" sortKey="updated" current={query.sort} order={query.order} onSort={sortBy} className="col-updated" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <TaskRow key={t.id} task={t} hideProject={hideProject} canEdit={canEdit && !t.archivedAt && !t.project.archived} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span className="muted tabular">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} od {data.total}
              {isFetching && <Spinner size={12} />}
            </span>
            <div className="row gap-2">
              <Select
                size_="sm"
                aria-label="Število na stran"
                value={String(pageSize)}
                onChange={(e) =>
                  setParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set('size', e.target.value);
                    next.delete('page');
                    return next;
                  })
                }
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} na stran
                  </option>
                ))}
              </Select>
              <Button size="sm" icon="chevronLeft" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Prejšnja stran" />
              <span className="tabular page-indicator">
                {page} / {totalPages}
              </span>
              <Button size="sm" icon="chevronRight" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Naslednja stran" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  order,
  onSort,
  className,
}: {
  label: string;
  sortKey: string;
  current: string;
  order: string;
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th className={className} aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={cx('th-sort', active && 'is-active')} onClick={() => onSort(sortKey)}>
        {label}
        <Icon name={active && order === 'asc' ? 'arrowUp' : 'arrowDown'} size={12} />
      </button>
    </th>
  );
}

function TaskRow({ task, hideProject, canEdit }: { task: Task; hideProject?: boolean; canEdit: boolean }) {
  const { openTask } = useTaskDrawer();
  const done = task.status.category === 'done';
  return (
    <tr
      className={cx('task-row', done && 'is-done', task.isOverdue && 'is-overdue', task.archivedAt && 'is-archived')}
      onClick={() => openTask(task.id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) openTask(task.id);
      }}
      aria-label={`${task.key} ${task.title}`}
    >
      <td className="col-title">
        <div className="task-cell">
          <span className="mono task-key">{task.key}</span>
          <span className="task-cell-title">
            <span className="truncate">{task.title}</span>
            {task.labels.slice(0, 2).map((l) => (
              <LabelChip key={l.id} name={l.name} color={l.color} />
            ))}
            {task.archivedAt && <span className="badge badge-neutral">Arhivirana</span>}
          </span>
        </div>
      </td>
      {!hideProject && (
        <td className="col-project" data-label="Projekt">
          <span className="row gap-2 truncate">
            <span className="project-dot" style={{ background: task.project.color }} />
            <span className="truncate">{task.project.name}</span>
          </span>
        </td>
      )}
      <td className="col-status" data-label="Status">
        <StatusEditor task={task} disabled={!canEdit} />
      </td>
      <td className="col-priority" data-label="Prioriteta">
        <PriorityEditor task={task} disabled={!canEdit} />
      </td>
      <td className="col-assignees" data-label="Odgovorni">
        {task.assignees.length ? (
          task.assignees.length === 1 ? (
            <span className="row gap-2 truncate">
              <Avatar user={task.assignees[0]} size={20} />
              <span className="truncate">{fullName(task.assignees[0])}</span>
            </span>
          ) : (
            <AvatarStack users={task.assignees} max={3} size={20} />
          )
        ) : (
          <span className="muted">Nedodeljeno</span>
        )}
      </td>
      <td className="col-due" data-label="Rok">
        <DueEditor task={task} disabled={!canEdit} />
      </td>
      <td className="col-updated muted" data-label="Posodobljeno">
        {timeAgo(task.updatedAt)}
      </td>
    </tr>
  );
}

function FilterBar({
  filters,
  update,
  search,
  setSearch,
  fixed,
  activeCount,
  reset,
  sort,
  order,
}: {
  filters: TaskFilterValues;
  update: (patch: TaskFilterValues) => void;
  search: string;
  setSearch: (v: string) => void;
  fixed: TaskFilterValues;
  activeCount: number;
  reset: () => void;
  sort: string;
  order: string;
}) {
  const facets = useFacets();
  const me = useCurrentUser();
  const isFixed = (k: FilterKey) => fixed[k] !== undefined;
  const members = (facets.data?.members ?? []).filter((m) => m.id !== me.id);
  const set = (key: FilterKey) => (v: string[]) => update({ [key]: v });

  return (
    <div className="filter-bar">
      <div className="toolbar-search toolbar-search-sm">
        <Icon name="search" size={14} />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Išči po naslovu, opisu ali oznaki (WEB-12)" aria-label="Išči naloge" />
      </div>
      {!isFixed('projectId') && (
        <FilterPicker
          label="Projekt"
          value={multi(filters, 'projectId')}
          onChange={set('projectId')}
          options={(facets.data?.projects ?? []).filter((p) => !p.archived || filters.archived === 'true').map((p) => ({ value: p.id, label: p.name, color: p.color }))}
        />
      )}
      <FilterPicker label="Status" value={multi(filters, 'status')} onChange={set('status')} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
      <FilterPicker label="Prioriteta" value={multi(filters, 'priority')} onChange={set('priority')} options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
      {!isFixed('assignee') && (
        <FilterPicker
          label="Odgovorni"
          value={multi(filters, 'assignee')}
          onChange={set('assignee')}
          width={280}
          options={[
            { value: 'me', label: `Jaz (${me.firstName})` },
            { value: 'none', label: 'Nedodeljeno' },
            ...members.map((m) => ({
              value: m.id,
              label: fullName(m),
              render: (
                <span className="row gap-2 truncate">
                  <Avatar user={m} size={18} />
                  <span className="truncate">{fullName(m)}</span>
                  {!m.isActive && <span className="muted">(neaktiven)</span>}
                </span>
              ),
            })),
          ]}
        />
      )}
      <FilterPicker
        label="Oznake"
        value={multi(filters, 'label')}
        onChange={set('label')}
        options={(facets.data?.labels ?? []).map((l) => ({ value: l.value, label: l.name, color: l.color }))}
      />
      <FilterPicker
        label="Rok"
        multiple={false}
        value={filters.due ? [String(filters.due)] : []}
        onChange={(v) => update({ due: v[0] })}
        options={[
          { value: 'overdue', label: 'Zamujene' },
          { value: 'today', label: 'Danes' },
          { value: 'week', label: 'V naslednjih 7 dneh' },
          { value: 'month', label: 'V naslednjih 30 dneh' },
          { value: 'none', label: 'Brez roka' },
        ]}
      />
      <button
        type="button"
        className={cx('filter-btn', filters.archived === 'true' && 'is-active')}
        aria-pressed={filters.archived === 'true'}
        onClick={() => update({ archived: filters.archived === 'true' ? undefined : 'true' })}
      >
        Arhiv
      </button>
      <div className="filter-bar-end">
        {activeCount > 0 && (
          <button type="button" className="link-button" onClick={reset}>
            Ponastavi ({activeCount})
          </button>
        )}
        <Select
          size_="sm"
          aria-label="Razvrsti po"
          value={`${sort}:${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(':');
            update({ sort: s, order: o });
          }}
        >
          <option value="updated:desc">Nazadnje posodobljene</option>
          <option value="created:desc">Najnovejše</option>
          <option value="created:asc">Najstarejše</option>
          <option value="due:asc">Rok – najprej najbližji</option>
          <option value="due:desc">Rok – najprej najkasnejši</option>
          <option value="priority:desc">Prioriteta – najvišja</option>
          <option value="priority:asc">Prioriteta – najnižja</option>
          <option value="title:asc">Naslov A–Ž</option>
          <option value="key:asc">Oznaka</option>
        </Select>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="table-wrap">
      <div className="table-skeleton">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton-row">
            <Skeleton width={48} height={12} />
            <Skeleton width={`${30 + ((i * 17) % 35)}%`} />
            <Skeleton width={80} height={18} radius={9} />
            <Skeleton width={60} height={12} />
            <Skeleton width={20} height={20} radius={10} />
          </div>
        ))}
      </div>
    </div>
  );
}
