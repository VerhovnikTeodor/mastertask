import { Link, useParams } from 'react-router-dom';
import { useTasks, useUserProfile } from '../../api/hooks';
import { useCurrentUser } from '../../context/auth';
import { StatCard, TaskLine } from '../../components/common';
import { Avatar, Badge, EmptyState, ErrorBlock, PageLoader, SectionCard } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDate, fullName, timeAgo, todayISO } from '../../lib/format';
import { ROLE_LABEL } from '../../lib/meta';
import type { ProjectRole, Task } from '../../lib/types';
import { NotFoundPage } from '../../pages/NotFound';

export default function MemberPage() {
  const { userId = '' } = useParams();
  const me = useCurrentUser();
  const profile = useUserProfile(userId);
  const open = useTasks({ assignee: [userId], status: ['todo', 'in_progress'], sort: 'due', order: 'asc', pageSize: 100 });
  const done = useTasks({ assignee: [userId], status: ['done'], sort: 'updated', order: 'desc', pageSize: 8 });

  if (profile.isPending) return <PageLoader label="Nalagam profil …" />;
  if (profile.error instanceof ApiError && profile.error.status === 404) return <NotFoundPage title="Uporabnik ne obstaja" message="Ta uporabniški račun ne obstaja." />;
  if (profile.error) return <div className="page"><ErrorBlock message={errorMessage(profile.error)} onRetry={() => profile.refetch()} /></div>;

  const user = profile.data;
  const openTasks = open.data?.items ?? [];
  const today = todayISO();
  const overdue = openTasks.filter((t) => t.isOverdue);
  const inProgress = openTasks.filter((t) => t.status.category === 'in_progress');
  const week = openTasks.filter((t) => t.dueDate && t.dueDate >= today && !t.isOverdue).slice(0, 50);
  const groups: { title: string; tasks: Task[]; tone?: 'danger' }[] = [
    { title: 'Zamujene', tasks: overdue, tone: 'danger' },
    { title: 'V teku', tasks: inProgress.filter((t) => !t.isOverdue) },
    { title: 'Prihajajoči roki', tasks: week.filter((t) => t.status.category !== 'in_progress') },
    { title: 'Brez roka', tasks: openTasks.filter((t) => !t.dueDate && t.status.category !== 'in_progress') },
  ];

  return (
    <div className="page">
      <nav className="breadcrumbs" aria-label="Drobtine">
        <Link to="/team">Ekipa</Link>
        <span aria-hidden="true">/</span>
        <span>{fullName(user)}</span>
      </nav>
      <header className="profile-header">
        <Avatar user={user} size={64} />
        <div className="stack gap-1">
          <div className="row gap-2 wrap">
            <h1 className="page-title">{fullName(user)}</h1>
            {user.id === me.id && <Badge tone="accent">vi</Badge>}
            {user.role === 'admin' && <Badge>skrbnik</Badge>}
            {!user.isActive && <Badge tone="danger">neaktiven račun</Badge>}
          </div>
          <p className="secondary">
            {user.jobTitle ? `${user.jobTitle} · ` : ''}
            <a href={`mailto:${user.email}`}>{user.email}</a>
          </p>
          <p className="muted small">
            Član od {formatDate(user.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}
            {user.lastLoginAt ? ` · zadnja prijava ${timeAgo(user.lastLoginAt)}` : ''}
          </p>
        </div>
      </header>

      <div className="stat-grid">
        <StatCard label="Odprte naloge" value={open.data?.total ?? '–'} />
        <StatCard label="V teku" value={inProgress.length} tone="accent" />
        <StatCard label="Zamujene" value={overdue.length} tone={overdue.length ? 'danger' : 'neutral'} />
        <StatCard label="Skupni projekti" value={user.projects.length} />
      </div>

      <div className="overview-grid">
        <SectionCard title="Dodeljene naloge" flush>
          {open.isPending ? (
            <PageLoader />
          ) : open.error ? (
            <div className="card-pad">
              <ErrorBlock message={errorMessage(open.error)} onRetry={() => open.refetch()} />
            </div>
          ) : openTasks.length === 0 ? (
            <EmptyState compact title="Ni odprtih nalog" description="V projektih, ki jih delite, ta član nima dodeljenih odprtih nalog." />
          ) : (
            groups
              .filter((g) => g.tasks.length)
              .map((g) => (
                <div key={g.title} className="task-group">
                  <h3 className={`task-group-title${g.tone === 'danger' ? ' text-danger' : ''}`}>
                    {g.title} <span className="count-pill">{g.tasks.length}</span>
                  </h3>
                  <div className="task-lines">
                    {g.tasks.map((t) => (
                      <TaskLine key={t.id} task={t} />
                    ))}
                  </div>
                </div>
              ))
          )}
        </SectionCard>

        <div className="stack gap-4">
          <SectionCard title="Skupni projekti" flush>
            {user.projects.length === 0 ? (
              <p className="card-pad muted">Nimata skupnih aktivnih projektov.</p>
            ) : (
              <ul className="simple-list">
                {user.projects.map((p) => (
                  <li key={p.id}>
                    <Link to={`/projects/${p.id}`} className="simple-list-link">
                      <span className="project-dot" style={{ background: p.color }} />
                      <span className="grow truncate">{p.name}</span>
                      <span className="muted small">{ROLE_LABEL[p.role as ProjectRole] ?? p.role}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Nedavno dokončano" flush>
            {done.data?.items.length ? (
              <div className="task-lines">
                {done.data.items.map((t) => (
                  <TaskLine key={t.id} task={t} />
                ))}
              </div>
            ) : (
              <p className="card-pad muted">{done.isPending ? 'Nalagam …' : 'Ni dokončanih nalog.'}</p>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
