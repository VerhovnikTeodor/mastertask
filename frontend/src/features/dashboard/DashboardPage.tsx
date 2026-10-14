import { Link } from 'react-router-dom';
import { useDashboard } from '../../api/hooks';
import { useCurrentUser, useProjectHref } from '../../context/auth';
import { useWorkspace } from '../../layout/workspace';
import { ActivityFeed, PageHeader, StatCard, TaskLine } from '../../components/common';
import { Badge, Button, EmptyState, ErrorBlock, ProgressBar, SectionCard, Skeleton } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { formatDate, formatDateLong, plural, todayISO } from '../../lib/format';
import { HEALTH } from '../../lib/meta';
import type { DashboardData } from '../../lib/types';

function greeting() {
  const h = new Date().getHours();
  if (h < 10) return 'Dobro jutro';
  if (h < 18) return 'Dober dan';
  return 'Dober večer';
}

export default function DashboardPage() {
  const user = useCurrentUser();
  const { openComposer } = useWorkspace();
  const { data, isPending, error, refetch } = useDashboard();

  return (
    <div className="page">
      <PageHeader
        eyebrow={formatDateLong(todayISO())}
        title={`${greeting()}, ${user.firstName}`}
        description={data ? summary(data) : 'Pregled vašega dela in projektov.'}
        actions={
          <Button variant="primary" icon="plus" onClick={() => openComposer()}>
            Nova naloga
          </Button>
        }
      />
      {error ? (
        <ErrorBlock message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <DashboardSkeleton />
      ) : (
        <DashboardContent data={data} />
      )}
    </div>
  );
}

function summary(data: DashboardData) {
  const { myOpen, myOverdue, myDueSoon } = data.stats;
  if (myOpen === 0) return 'Nimate odprtih nalog. Odlično delo!';
  const parts = [`Imate ${myOpen} ${plural(myOpen, ['odprto nalogo', 'odprti nalogi', 'odprte naloge', 'odprtih nalog'])}`];
  if (myOverdue) parts.push(`${myOverdue} ${plural(myOverdue, ['zamuja', 'zamujata', 'zamujajo', 'zamuja'])}`);
  if (myDueSoon) parts.push(`${myDueSoon} z rokom v naslednjem tednu`);
  return `${parts.join(', ')}.`;
}

function DashboardContent({ data }: { data: DashboardData }) {
  const { stats } = data;
  const projectHref = useProjectHref();
  return (
    <>
      <div className="stat-grid">
        <StatCard label="Moje odprte naloge" value={stats.myOpen} to="/tasks?assignee=me&status=todo,in_progress" hint={`${stats.activeProjects} aktivnih projektov`} />
        <StatCard label="V teku" value={stats.myInProgress} tone="accent" to="/tasks?assignee=me&status=in_progress" hint="Trenutno v delu" />
        <StatCard
          label="Zamujene"
          value={stats.myOverdue}
          tone={stats.myOverdue ? 'danger' : 'neutral'}
          to="/tasks?assignee=me&due=overdue"
          hint={stats.teamOverdue ? `${stats.teamOverdue} v vseh projektih` : 'Brez zamud v ekipi'}
        />
        <StatCard label="Rok v 7 dneh" value={stats.myDueSoon} tone={stats.myDueSoon ? 'warning' : 'neutral'} to="/tasks?assignee=me&due=week" hint="Prihajajoči roki" />
        <StatCard label="Dokončane ta teden" value={stats.myCompletedWeek} tone="success" hint="Zadnjih 7 dni" />
      </div>

      <div className="dashboard-grid">
        <div className="stack gap-4">
          {data.overdue.length > 0 && (
            <SectionCard
              className="card-danger"
              title={
                <>
                  Zamuja v vaših projektih <span className="count-pill count-danger">{data.overdue.length}</span>
                </>
              }
              action={<Link className="card-link" to="/tasks?due=overdue">Prikaži vse</Link>}
              flush
            >
              <div className="task-lines">
                {data.overdue.map((t) => (
                  <TaskLine key={t.id} task={t} />
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Moje naloge" action={<Link className="card-link" to="/tasks?assignee=me">Vse moje naloge</Link>} flush>
            {data.myTasks.length ? (
              <div className="task-lines">
                {data.myTasks.map((t) => (
                  <TaskLine key={t.id} task={t} />
                ))}
              </div>
            ) : (
              <EmptyState compact title="Ni dodeljenih nalog" description="Ko vam bo kdo dodelil nalogo, se bo prikazala tukaj." />
            )}
          </SectionCard>

          <SectionCard title="Prihajajoči roki" action={<Link className="card-link" to="/calendar">Koledar</Link>} flush>
            {data.upcoming.length ? (
              <UpcomingList tasks={data.upcoming} />
            ) : (
              <EmptyState compact title="Ni prihajajočih rokov" description="V naslednjih 14 dneh ni nalog z rokom." />
            )}
          </SectionCard>

          <SectionCard title="Nedavno spremenjeno" flush>
            {data.recentlyUpdated.length ? (
              <div className="task-lines">
                {data.recentlyUpdated.map((t) => (
                  <TaskLine key={t.id} task={t} />
                ))}
              </div>
            ) : (
              <EmptyState compact title="Še ni sprememb" />
            )}
          </SectionCard>
        </div>

        <div className="stack gap-4">
          <SectionCard
            title="Napredek projektov"
            action={<Link className="card-link" to="/projects">Vsi projekti</Link>}
          >
            {data.projects.length ? (
              <ul className="project-progress-list">
                {data.projects.map((p) => (
                  <li key={p.id}>
                    <Link to={projectHref(p.id)} className="project-progress">
                      <div className="row between gap-2">
                        <span className="row gap-2" style={{ minWidth: 0 }}>
                          <span className="project-square" style={{ background: p.color }} />
                          <span className="truncate strong">{p.name}</span>
                        </span>
                        <Badge tone={HEALTH[p.health].tone}>{HEALTH[p.health].label}</Badge>
                      </div>
                      <ProgressBar value={p.progress} tone={HEALTH[p.health].tone === 'danger' ? 'danger' : 'accent'} size="sm" label={`Napredek ${p.name}`} />
                      <div className="row between project-progress-meta">
                        <span className="tabular">
                          {p.stats.done}/{p.stats.total} nalog · {p.progress} %
                        </span>
                        <span>
                          {p.stats.overdue > 0 ? <span className="text-danger">{p.stats.overdue} zamujenih</span> : p.dueDate ? `Rok ${formatDate(p.dueDate)}` : 'Brez roka'}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title="Ni aktivnih projektov" action={<Link className="btn btn-secondary btn-sm" to="/projects?new=1">Nov projekt</Link>} />
            )}
          </SectionCard>

          <SectionCard title="Dokončane naloge · 14 dni">
            <ThroughputChart data={data.throughput} />
          </SectionCard>

          <SectionCard title="Nedavna aktivnost">
            {data.activity.length ? <ActivityFeed items={data.activity} /> : <EmptyState compact title="Še ni aktivnosti" />}
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function UpcomingList({ tasks }: { tasks: DashboardData['upcoming'] }) {
  const groups = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const key = t.dueDate ?? '';
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return (
    <div className="upcoming">
      {[...groups.entries()].map(([date, list]) => (
        <div key={date} className="upcoming-group">
          <div className="upcoming-date">{formatDateLong(date)}</div>
          <div className="task-lines">
            {list.map((t) => (
              <TaskLine key={t.id} task={t} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ThroughputChart({ data }: { data: DashboardData['throughput'] }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.completed, d.created)));
  const totalDone = data.reduce((s, d) => s + d.completed, 0);
  const totalCreated = data.reduce((s, d) => s + d.created, 0);
  return (
    <div className="throughput">
      <div className="throughput-summary">
        <span>
          <strong className="tabular">{totalDone}</strong> dokončanih
        </span>
        <span className="muted">
          <strong className="tabular">{totalCreated}</strong> novih
        </span>
      </div>
      <div className="throughput-bars" role="img" aria-label={`V zadnjih 14 dneh dokončanih ${totalDone} in ustvarjenih ${totalCreated} nalog`}>
        {data.map((d) => (
          <div key={d.day} className="throughput-col" title={`${formatDate(d.day)}: ${d.completed} dokončanih, ${d.created} novih`}>
            <span className="throughput-created" style={{ height: `${(d.created / max) * 100}%` }} />
            <span className="throughput-done" style={{ height: `${(d.completed / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="throughput-axis">
        <span>{formatDate(data[0]?.day)}</span>
        <span>Danes</span>
      </div>
      <div className="legend">
        <span><i className="legend-done" /> Dokončane</span>
        <span><i className="legend-created" /> Ustvarjene</span>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="stat-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="stat">
            <Skeleton width="60%" />
            <Skeleton width={48} height={28} />
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="card">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-line">
              <Skeleton width={8} height={8} radius={4} />
              <Skeleton width={`${50 + ((i * 13) % 40)}%`} />
            </div>
          ))}
        </div>
        <div className="card">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stack gap-2" style={{ marginBottom: 16 }}>
              <Skeleton width="40%" />
              <Skeleton height={6} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
