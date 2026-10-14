import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarkRead, useNotifications } from '../../api/hooks';
import { useFeedback } from '../../context/feedback';
import { PageHeader } from '../../components/common';
import { Avatar, Button, cx, EmptyState, ErrorBlock, Segmented, Skeleton } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { addDays, formatDateLong, fullName, timeAgo, toISODate, todayISO } from '../../lib/format';
import { ROLE_LABEL } from '../../lib/meta';
import type { Notification, ProjectRole } from '../../lib/types';

function describe(n: Notification): { verb: string; excerpt?: string } {
  const d = n.details ?? {};
  switch (n.type) {
    case 'task_assigned':
      return { verb: 'vam je dodelil(a) nalogo' };
    case 'comment_added':
      return { verb: 'je komentiral(a) nalogo', excerpt: d.excerpt };
    case 'task_completed':
      return { verb: 'je dokončal(a) nalogo' };
    case 'project_added':
      return { verb: `vas je dodal(a) v projekt kot ${(ROLE_LABEL[d.role as ProjectRole] ?? 'član').toLowerCase()}` };
    default:
      return { verb: 'je posodobil(a) vsebino' };
  }
}

function dayGroup(iso: string) {
  const day = toISODate(new Date(iso));
  const today = todayISO();
  if (day === today) return 'Danes';
  if (day === addDays(today, -1)) return 'Včeraj';
  if (day > addDays(today, -7)) return 'Ta teden';
  return 'Starejše';
}

export default function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const { data, isPending, error, refetch } = useNotifications();
  const markRead = useMarkRead();
  const { error: showError } = useFeedback();
  const navigate = useNavigate();

  const items = (data?.items ?? []).filter((n) => filter === 'all' || !n.readAt);
  const groups = items.reduce<{ label: string; items: Notification[] }[]>((acc, n) => {
    const label = dayGroup(n.createdAt);
    const last = acc[acc.length - 1];
    if (last?.label === label) last.items.push(n);
    else acc.push({ label, items: [n] });
    return acc;
  }, []);

  const open = (n: Notification) => {
    if (!n.readAt) markRead.mutate({ ids: [n.id] });
    if (n.task && n.project) navigate(`/projects/${n.project.id}?task=${n.task.id}`);
    else if (n.project) navigate(`/projects/${n.project.id}`);
  };

  return (
    <div className="page page-narrow">
      <PageHeader
        title="Obvestila"
        description={data ? (data.unreadCount ? `Neprebranih: ${data.unreadCount}` : 'Vse je prebrano.') : undefined}
        actions={
          <Button
            disabled={!data?.unreadCount}
            loading={markRead.isPending}
            onClick={() => markRead.mutate({ all: true }, { onError: (err) => showError(err) })}
          >
            Označi vse kot prebrano
          </Button>
        }
      />
      <div className="toolbar">
        <Segmented
          label="Prikaz"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Vsa' },
            { value: 'unread', label: `Neprebrana${data?.unreadCount ? ` · ${data.unreadCount}` : ''}` },
          ]}
        />
      </div>

      {error ? (
        <ErrorBlock message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="card card-pad stack gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={40} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          art="inbox"
          title={filter === 'unread' ? 'Ni neprebranih obvestil' : 'Ni obvestil'}
          description="Obveščeni boste, ko vam nekdo dodeli nalogo, komentira vašo nalogo, dokonča nalogo, ki ste jo ustvarili, ali vas doda v projekt."
        />
      ) : (
        groups.map((g) => (
          <section key={g.label} className="notif-group">
            <h2 className="notif-group-title">{g.label}</h2>
            <ul className="card card-flush notif-list">
              {g.items.map((n) => {
                const { verb, excerpt } = describe(n);
                return (
                  <li key={n.id}>
                    <button type="button" className={cx('notif', !n.readAt && 'is-unread')} onClick={() => open(n)}>
                      {n.actor ? <Avatar user={n.actor} size={32} /> : <span className="avatar avatar-system" style={{ width: 32, height: 32 }} />}
                      <span className="notif-body">
                        <span>
                          <strong>{n.actor ? fullName(n.actor) : 'Sistem'}</strong> {verb}
                          {n.task && (
                            <>
                              {' '}
                              <span className="mono muted">{n.task.key}</span> <strong>{n.task.title}</strong>
                            </>
                          )}
                          {!n.task && n.project && (
                            <>
                              {' '}
                              <strong>{n.project.name}</strong>
                            </>
                          )}
                        </span>
                        {excerpt && <span className="notif-excerpt">»{excerpt}«</span>}
                        <span className="notif-meta">
                          {n.project && (
                            <span className="row gap-1">
                              <span className="project-dot" style={{ background: n.project.color }} />
                              {n.project.name}
                            </span>
                          )}
                          <time dateTime={n.createdAt} title={formatDateLong(n.createdAt)}>
                            {timeAgo(n.createdAt)}
                          </time>
                        </span>
                      </span>
                      {!n.readAt && <span className="notif-dot" aria-label="Neprebrano" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
