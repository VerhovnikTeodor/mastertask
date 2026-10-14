import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFacets, useTasks } from '../../api/hooks';
import { PageHeader, TaskLine } from '../../components/common';
import { Modal } from '../../components/overlays';
import { Button, cx, ErrorBlock, IconButton, Segmented, Select, Spinner } from '../../components/ui';
import { useTaskDrawer, useWorkspace } from '../../layout/workspace';
import { errorMessage } from '../../lib/api';
import { addDays, formatDateLong, parseISODate, plural, toISODate, todayISO } from '../../lib/format';
import type { Task } from '../../lib/types';

const WEEKDAYS = ['pon', 'tor', 'sre', 'čet', 'pet', 'sob', 'ned'];
const MAX_VISIBLE = 3;

function monthGrid(month: string) {
  const first = parseISODate(`${month}-01`);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(`${month}-01`, -offset);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const cells = Math.ceil((offset + last.getDate()) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => addDays(start, i));
}

function shiftMonth(month: string, delta: number) {
  const d = parseISODate(`${month}-01`);
  d.setMonth(d.getMonth() + delta);
  return toISODate(d).slice(0, 7);
}

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : today.slice(0, 7);
  const scope = params.get('scope') === 'all' ? 'all' : 'mine';
  const projectId = params.get('projectId') ?? '';
  const { openTask } = useTaskDrawer();
  const { openComposer } = useWorkspace();
  const facets = useFacets();
  const [openDay, setOpenDay] = useState<string | null>(null);

  const days = useMemo(() => monthGrid(month), [month]);
  const tasks = useTasks({
    dueFrom: days[0],
    dueTo: days[days.length - 1],
    assignee: scope === 'mine' ? 'me' : undefined,
    projectId: projectId || undefined,
    sort: 'priority',
    order: 'desc',
    pageSize: 500,
  });

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks.data?.items ?? []) {
      if (!t.dueDate) continue;
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    return map;
  }, [tasks.data]);

  const update = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    });

  const monthLabel = parseISODate(`${month}-01`).toLocaleDateString('sl-SI', { month: 'long', year: 'numeric' });
  const inMonth = (tasks.data?.items ?? []).filter((t) => t.dueDate?.startsWith(month));
  const overdueCount = inMonth.filter((t) => t.isOverdue).length;
  const agendaDays = days.filter((d) => d.startsWith(month) && byDay.has(d));

  return (
    <div className="page page-wide calendar-page">
      <PageHeader
        title="Koledar"
        description={
          tasks.isPending
            ? 'Nalagam roke …'
            : `${inMonth.length} ${plural(inMonth.length, ['naloga', 'nalogi', 'naloge', 'nalog'])} z rokom v tem mesecu${overdueCount ? ` · ${overdueCount} zamuja` : ''}`
        }
        actions={
          <Button variant="primary" icon="plus" onClick={() => openComposer()}>
            Nova naloga
          </Button>
        }
      />
      <div className="toolbar calendar-toolbar">
        <div className="row gap-1">
          <IconButton icon="chevronLeft" label="Prejšnji mesec" onClick={() => update({ month: shiftMonth(month, -1) })} />
          <h2 className="calendar-month">{monthLabel}</h2>
          <IconButton icon="chevronRight" label="Naslednji mesec" onClick={() => update({ month: shiftMonth(month, 1) })} />
          <Button size="sm" variant="ghost" onClick={() => update({ month: null })} disabled={month === today.slice(0, 7)}>
            Danes
          </Button>
          {tasks.isFetching && !tasks.isPending && <Spinner size={14} />}
        </div>
        <span className="grow" />
        <Select size_="sm" aria-label="Projekt" value={projectId} onChange={(e) => update({ projectId: e.target.value || null })}>
          <option value="">Vsi projekti</option>
          {facets.data?.projects
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
        <Segmented
          label="Obseg"
          value={scope}
          onChange={(v) => update({ scope: v === 'all' ? 'all' : null })}
          options={[
            { value: 'mine', label: 'Moje naloge' },
            { value: 'all', label: 'Vse naloge' },
          ]}
        />
      </div>

      {tasks.error ? (
        <ErrorBlock message={errorMessage(tasks.error)} onRetry={() => tasks.refetch()} />
      ) : (
        <>
          <div className="calendar" role="grid" aria-label={`Koledar ${monthLabel}`}>
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={cx('calendar-weekday', i >= 5 && 'is-weekend')} role="columnheader">
                {d}
              </div>
            ))}
            {days.map((day) => {
              const list = byDay.get(day) ?? [];
              const outside = !day.startsWith(month);
              const weekend = [0, 6].includes(parseISODate(day).getDay());
              return (
                <div
                  key={day}
                  role="gridcell"
                  className={cx('calendar-day', outside && 'is-outside', day === today && 'is-today', weekend && 'is-weekend', day < today && 'is-past')}
                  aria-label={`${formatDateLong(day)}, ${list.length} ${plural(list.length, ['naloga', 'nalogi', 'naloge', 'nalog'])}`}
                >
                  <div className="calendar-day-head">
                    <span className="calendar-date">{parseISODate(day).getDate()}</span>
                    <button type="button" className="calendar-add" aria-label={`Nova naloga z rokom ${formatDateLong(day)}`} onClick={() => openComposer({ dueDate: day })}>
                      +
                    </button>
                  </div>
                  <div className="calendar-items">
                    {list.slice(0, MAX_VISIBLE).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={cx('calendar-task', t.status.category === 'done' && 'is-done', t.isOverdue && 'is-overdue', `prio-edge-${t.priority}`)}
                        style={{ ['--project' as string]: t.project.color }}
                        onClick={() => openTask(t.id)}
                        title={`${t.key} · ${t.title} · ${t.status.name}`}
                      >
                        <span className="truncate">{t.title}</span>
                      </button>
                    ))}
                    {list.length > MAX_VISIBLE && (
                      <button type="button" className="calendar-more" onClick={() => setOpenDay(day)}>
                        še {list.length - MAX_VISIBLE}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="calendar-agenda" aria-label="Seznam rokov">
            {agendaDays.length === 0 && !tasks.isPending && <p className="muted">Ta mesec ni nalog z rokom.</p>}
            {agendaDays.map((day) => (
              <section key={day} className="agenda-day">
                <h3 className={cx('agenda-date', day === today && 'is-today')}>{formatDateLong(day)}</h3>
                <div className="task-lines">
                  {byDay.get(day)!.map((t) => (
                    <TaskLine key={t.id} task={t} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      <Modal open={Boolean(openDay)} onClose={() => setOpenDay(null)} title={openDay ? formatDateLong(openDay) : ''} size="md">
        <div className="task-lines">
          {(openDay ? byDay.get(openDay) ?? [] : []).map((t) => (
            <TaskLine key={t.id} task={t} />
          ))}
        </div>
      </Modal>
    </div>
  );
}
