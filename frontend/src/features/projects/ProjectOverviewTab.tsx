import { Link } from 'react-router-dom';
import { useBoard, useProjectActivity } from '../../api/hooks';
import { ActivityFeed, StatCard, TaskLine } from '../../components/common';
import { Avatar, Badge, EmptyState, ErrorBlock, PageLoader, SectionCard, Skeleton } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { addDays, daysFromToday, formatDate, fullName, parseISODate, plural, pluralDays, todayISO } from '../../lib/format';
import { PRIORITIES, PRIORITY_LABEL, ROLE_LABEL } from '../../lib/meta';
import type { ProjectDetail, Task } from '../../lib/types';
import { useProjectContext } from './ProjectLayout';

export default function ProjectOverviewTab() {
  const { project } = useProjectContext();
  const board = useBoard(project.id);
  const activity = useProjectActivity(project.id);
  const s = project.stats;

  return (
    <div className="project-body overview">
      <div className="stat-grid">
        <StatCard label="Vse naloge" value={s.total} hint={`${s.open} odprtih`} />
        <StatCard label="V teku" value={s.inProgress} tone="accent" />
        <StatCard label="Zamujene" value={s.overdue} tone={s.overdue ? 'danger' : 'neutral'} hint={s.overdue ? 'Potrebujejo pozornost' : 'Vse v roku'} />
        <StatCard label="Rok v 7 dneh" value={s.dueSoon} tone={s.dueSoon ? 'warning' : 'neutral'} />
        <StatCard label="Dokončane" value={`${project.progress} %`} tone="success" hint={`${s.done} od ${s.total}`} />
      </div>

      <div className="overview-grid">
        <div className="stack gap-4">
          <SectionCard title="O projektu">
            <div className="card-pad stack gap-4">
              {project.description ? <p className="prose">{project.description}</p> : <p className="muted">Projekt nima opisa.</p>}
              <Timeline project={project} />
            </div>
          </SectionCard>

          <SectionCard title="Naloge po statusih">
            <div className="card-pad">
              <StatusBreakdown project={project} />
            </div>
          </SectionCard>

          <SectionCard title="Prihajajoči roki" action={<Link className="card-link" to="../list?due=week&sort=due&order=asc">Vse</Link>} flush>
            {board.isPending ? (
              <div className="card-pad stack gap-2">
                <Skeleton height={36} />
                <Skeleton height={36} />
              </div>
            ) : board.error ? (
              <div className="card-pad">
                <ErrorBlock message={errorMessage(board.error)} onRetry={() => board.refetch()} />
              </div>
            ) : (
              <Upcoming tasks={board.data} />
            )}
          </SectionCard>
        </div>

        <div className="stack gap-4">
          <SectionCard title="Odprte naloge po prioriteti">
            <div className="card-pad">{board.data ? <PriorityBreakdown tasks={board.data} /> : <Skeleton height={96} />}</div>
          </SectionCard>

          <SectionCard title="Obremenitev članov" action={<Link className="card-link" to="../members">Člani</Link>} flush>
            <Workload project={project} />
          </SectionCard>

          <SectionCard title="Zadnja aktivnost">
            <div className="card-pad">
              {activity.isPending ? (
                <PageLoader />
              ) : activity.data?.length ? (
                <ActivityFeed items={activity.data.slice(0, 12)} showProject={false} />
              ) : (
                <p className="muted">V projektu še ni aktivnosti.</p>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Timeline({ project }: { project: ProjectDetail }) {
  if (!project.startDate && !project.dueDate) {
    return <p className="muted">Časovnica ni določena. Začetek in rok lahko nastavite pri urejanju projekta.</p>;
  }
  const today = todayISO();
  let elapsed: number | null = null;
  if (project.startDate && project.dueDate) {
    const total = parseISODate(project.dueDate).getTime() - parseISODate(project.startDate).getTime();
    const gone = parseISODate(today).getTime() - parseISODate(project.startDate).getTime();
    elapsed = total > 0 ? Math.max(0, Math.min(100, Math.round((gone / total) * 100))) : 100;
  }
  const behind = elapsed !== null && project.status !== 'completed' && elapsed - project.progress > 20;
  const left = project.dueDate ? daysFromToday(project.dueDate) : null;

  return (
    <div className="timeline">
      <div className="timeline-dates">
        <div>
          <span className="eyebrow">Začetek</span>
          <strong>{project.startDate ? formatDate(project.startDate, { day: 'numeric', month: 'long' }) : '—'}</strong>
        </div>
        <div className="text-right">
          <span className="eyebrow">Rok</span>
          <strong className={project.isPastDue ? 'text-danger' : undefined}>
            {project.dueDate ? formatDate(project.dueDate, { day: 'numeric', month: 'long' }) : '—'}
          </strong>
        </div>
      </div>
      {elapsed !== null && (
        <div className="timeline-track" aria-hidden="true">
          <span className="timeline-progress" style={{ width: `${project.progress}%` }} />
          <span className="timeline-now" style={{ left: `${elapsed}%` }} />
        </div>
      )}
      <p className="secondary">
        {project.status === 'completed'
          ? 'Projekt je zaključen.'
          : left === null
            ? 'Brez roka.'
            : left < 0
              ? <span className="text-danger">Rok je potekel pred {Math.abs(left)} {pluralDays(Math.abs(left))}.</span>
              : left === 0
                ? 'Rok je danes.'
                : `Do roka ${left === 1 ? 'je še' : 'so še'} ${left} ${pluralDays(left)}.`}
        {elapsed !== null && project.status !== 'completed' && (
          <>
            {' '}Preteklo je {elapsed} % časa, opravljenih je {project.progress} % nalog.
            {behind && <Badge tone="warning" className="ml-2">Zaostaja za načrtom</Badge>}
          </>
        )}
      </p>
    </div>
  );
}

function StatusBreakdown({ project }: { project: ProjectDetail }) {
  const total = project.columns.reduce((sum, c) => sum + c.taskCount, 0);
  if (!total) return <p className="muted">V projektu še ni nalog.</p>;
  return (
    <div className="stack gap-3">
      <div className="stacked-bar" role="img" aria-label="Razporeditev nalog po statusih">
        {project.columns.map((c) =>
          c.taskCount ? <span key={c.id} style={{ width: `${(c.taskCount / total) * 100}%`, background: c.color }} title={`${c.name}: ${c.taskCount}`} /> : null,
        )}
      </div>
      <ul className="legend">
        {project.columns.map((c) => (
          <li key={c.id}>
            <span className="legend-dot" style={{ background: c.color }} />
            <span className="grow truncate">{c.name}</span>
            <span className="tabular strong">{c.taskCount}</span>
            <span className="tabular muted legend-pct">{Math.round((c.taskCount / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PriorityBreakdown({ tasks }: { tasks: Task[] }) {
  const open = tasks.filter((t) => t.status.category !== 'done');
  if (!open.length) return <p className="muted">Ni odprtih nalog.</p>;
  const max = Math.max(...PRIORITIES.map((p) => open.filter((t) => t.priority === p.value).length), 1);
  return (
    <ul className="bars">
      {PRIORITIES.map((p) => {
        const n = open.filter((t) => t.priority === p.value).length;
        return (
          <li key={p.value} className={`bar-row prio-row-${p.value}`}>
            <span className="bar-label">{PRIORITY_LABEL[p.value]}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(n / max) * 100}%` }} />
            </span>
            <span className="tabular strong bar-value">{n}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Workload({ project }: { project: ProjectDetail }) {
  const members = [...project.members].sort((a, b) => b.openTasks - a.openTasks);
  const max = Math.max(...members.map((m) => m.openTasks), 1);
  return (
    <ul className="workload-list">
      {members.map((m) => (
        <li key={m.id} className="workload-row">
          <Avatar user={m} size={28} />
          <div className="workload-main">
            <div className="row gap-2">
              <Link to={`/team/${m.id}`} className="strong truncate">
                {fullName(m)}
              </Link>
              <span className="muted">{ROLE_LABEL[m.role]}</span>
            </div>
            <span className="bar-track" aria-hidden="true">
              <span className="bar-fill" style={{ width: `${(m.openTasks / max) * 100}%` }} />
              {m.overdueTasks > 0 && <span className="bar-fill bar-fill-danger" style={{ width: `${(m.overdueTasks / max) * 100}%` }} />}
            </span>
          </div>
          <div className="workload-nums">
            <span className="tabular strong">{m.openTasks}</span>
            <span className="muted">{plural(m.openTasks, ['odprta', 'odprti', 'odprte', 'odprtih'])}</span>
            {m.overdueTasks > 0 && <span className="text-danger tabular">{m.overdueTasks} zamuja</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Upcoming({ tasks }: { tasks: Task[] }) {
  const limit = addDays(todayISO(), 14);
  const list = tasks
    .filter((t) => t.dueDate && t.status.category !== 'done' && t.dueDate <= limit)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
    .slice(0, 8);
  if (!list.length) return <EmptyState compact title="Ni rokov v naslednjih 14 dneh" description="Zamujene in prihajajoče naloge se prikažejo tukaj." />;
  return (
    <div className="task-lines">
      {list.map((t) => (
        <TaskLine key={t.id} task={t} showProject={false} />
      ))}
    </div>
  );
}
