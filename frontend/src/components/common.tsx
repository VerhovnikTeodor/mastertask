import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarStack, cx, DueBadge, LabelChip, PriorityBadge, StatusBadge } from './ui';
import { formatDate, fullName, timeAgo } from '../lib/format';
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL, ROLE_LABEL } from '../lib/meta';
import type { ActivityEntry, Priority, ProjectRole, ProjectStatus, Task } from '../lib/types';
import { useTaskDrawer } from '../layout/workspace';

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-row">
        <div className="page-header-text">
          {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-description">{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  to,
}: {
  label: string;
  value: number | string;
  hint?: ReactNode;
  tone?: 'neutral' | 'accent' | 'danger' | 'warning' | 'success';
  to?: string;
}) {
  const content = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value tabular">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );
  return to ? (
    <Link to={to} className={cx('stat', `stat-${tone}`, 'stat-link')}>
      {content}
    </Link>
  ) : (
    <div className={cx('stat', `stat-${tone}`)}>{content}</div>
  );
}

/** Kompaktna vrstica naloge za sezname na nadzorni plošči, profilu člana ipd. */
export function TaskLine({ task, showProject = true }: { task: Task; showProject?: boolean }) {
  const { openTask } = useTaskDrawer();
  const done = task.status.category === 'done';
  return (
    <button type="button" className={cx('task-line', done && 'is-done')} onClick={() => openTask(task.id)}>
      <span className="task-line-status" style={{ background: task.status.color }} title={task.status.name} />
      <span className="task-line-main">
        <span className="task-line-title truncate">{task.title}</span>
        <span className="task-line-meta">
          <span className="mono">{task.key}</span>
          {showProject && (
            <>
              <span className="dot-sep" />
              <span className="truncate">{task.project.name}</span>
            </>
          )}
          <span className="dot-sep" />
          <span>{task.status.name}</span>
        </span>
      </span>
      <span className="task-line-side">
        <PriorityBadge priority={task.priority} compact />
        <DueBadge date={task.dueDate} done={done} />
        <AvatarStack users={task.assignees} max={2} size={20} />
      </span>
    </button>
  );
}

export function TaskMetaRow({ task }: { task: Task }) {
  return (
    <span className="row gap-2 wrap">
      <StatusBadge status={task.status} />
      <PriorityBadge priority={task.priority} />
      {task.labels.map((l) => (
        <LabelChip key={l.id} name={l.name} color={l.color} />
      ))}
    </span>
  );
}

const FIELD_LABEL: Record<string, string> = {
  title: 'naslov',
  description: 'opis',
  priority: 'prioriteta',
  startDate: 'začetek',
  dueDate: 'rok',
  status: 'status',
  assignees: 'odgovorni',
  labels: 'oznake',
};

function describeChange(change: Record<string, unknown>): string {
  const field = String(change.field);
  const fmt = (v: unknown) => {
    if (v === null || v === undefined || v === '') return '—';
    if (field === 'priority') return PRIORITY_LABEL[v as Priority] ?? String(v);
    if (field === 'dueDate' || field === 'startDate') return formatDate(String(v));
    return String(v);
  };
  if (field === 'description') return 'posodobljen opis';
  if (field === 'assignees' || field === 'labels') {
    const added = (change.added as string[]) ?? [];
    const removed = (change.removed as string[]) ?? [];
    const parts = [];
    if (added.length) parts.push(`${field === 'assignees' ? 'dodeljeno' : 'dodana oznaka'}: ${added.join(', ')}`);
    if (removed.length) parts.push(`${field === 'assignees' ? 'odstranjeno' : 'odstranjena oznaka'}: ${removed.join(', ')}`);
    return parts.join('; ');
  }
  return `${FIELD_LABEL[field] ?? field}: ${fmt(change.from)} → ${fmt(change.to)}`;
}

export function describeActivity(entry: ActivityEntry): string {
  const d = entry.details as Record<string, unknown>;
  const s = (key: string) => String(d[key] ?? '');
  switch (entry.action) {
    case 'task_created':
      return `Nova naloga v stolpcu »${s('column')}«`;
    case 'task_updated': {
      const changes = (d.changes as Record<string, unknown>[]) ?? [];
      return changes.map(describeChange).join(' · ') || 'Posodobljena naloga';
    }
    case 'task_moved':
      return `Premik: ${s('from')} → ${s('to')}`;
    case 'task_archived':
      return 'Naloga arhivirana';
    case 'task_restored':
      return 'Naloga obnovljena iz arhiva';
    case 'task_deleted':
      return `Izbrisana naloga »${s('title')}«`;
    case 'comment_added':
      return 'Nov komentar';
    case 'checklist_added':
      return `Nova podnaloga: ${s('item')}`;
    case 'checklist_done':
      return `Opravljena podnaloga: ${s('item')}`;
    case 'checklist_reopened':
      return `Ponovno odprta podnaloga: ${s('item')}`;
    case 'dependency_added':
      return `Dodana odvisnost: blokira jo ${s('blockedBy')}`;
    case 'project_created':
      return `Ustvarjen projekt »${s('name')}«`;
    case 'project_updated':
      return d.statusTo
        ? `Status projekta: ${PROJECT_STATUS_LABEL[d.statusFrom as ProjectStatus]} → ${PROJECT_STATUS_LABEL[d.statusTo as ProjectStatus]}`
        : 'Posodobljene podrobnosti projekta';
    case 'project_archived':
      return 'Projekt arhiviran';
    case 'project_restored':
      return 'Projekt obnovljen iz arhiva';
    case 'member_added':
      return `Nov član: ${s('member')} (${ROLE_LABEL[d.role as ProjectRole] ?? s('role')})`;
    case 'member_removed':
      return `Odstranjen član: ${s('member')}${Number(d.unassignedTasks) ? ` · razdodeljenih nalog: ${s('unassignedTasks')}` : ''}`;
    case 'member_left':
      return `${s('member')} je zapustil(a) projekt`;
    case 'member_role_changed':
      return `Vloga za ${s('member')}: ${ROLE_LABEL[d.from as ProjectRole]} → ${ROLE_LABEL[d.to as ProjectRole]}`;
    case 'ownership_transferred':
      return `Lastništvo preneseno na: ${s('member')}`;
    case 'column_created':
      return `Nov stolpec »${s('name')}«`;
    case 'column_deleted':
      return `Izbrisan stolpec »${s('name')}«`;
    default:
      return 'Sprememba';
  }
}

export function ActivityFeed({ items, showProject = true, showTask = true }: { items: ActivityEntry[]; showProject?: boolean; showTask?: boolean }) {
  const { openTask } = useTaskDrawer();
  return (
    <ol className="activity">
      {items.map((a) => (
        <li key={a.id} className="activity-item">
          {a.actor ? <Avatar user={a.actor} size={24} /> : <span className="avatar avatar-system" style={{ width: 24, height: 24 }} />}
          <div className="activity-body">
            <p>
              <strong>{a.actor ? fullName(a.actor) : 'Sistem'}</strong>{' '}
              <span className="secondary">{describeActivity(a)}</span>
            </p>
            <p className="activity-meta">
              {showTask && a.task && (
                <button type="button" className="link-button" onClick={() => openTask(a.task!.id)}>
                  <span className="mono">{a.task.key}</span> {a.task.title}
                </button>
              )}
              {showProject && (
                <Link to={`/projects/${a.project.id}`} className="activity-project">
                  <span className="project-dot" style={{ background: a.project.color }} />
                  {a.project.name}
                </Link>
              )}
              <time dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString('sl-SI')}>
                {timeAgo(a.createdAt)}
              </time>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
