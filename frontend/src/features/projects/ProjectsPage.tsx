import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useProjects, type ProjectFilters } from '../../api/hooks';
import { PageHeader } from '../../components/common';
import { AvatarStack, Badge, Button, cx, EmptyState, ErrorBlock, Input, ProgressBar, Select, Skeleton } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { formatDate, plural } from '../../lib/format';
import { HEALTH, PRIORITY_LABEL, PROJECT_STATUS_LABEL, ROLE_LABEL } from '../../lib/meta';
import { useDebounced } from '../../lib/useDebounced';
import { useProjectHref } from '../../context/auth';
import type { Health, Project } from '../../lib/types';
import { ProjectFormModal } from './ProjectFormModal';

const SCOPES = [
  { value: 'open', label: 'Odprti' },
  { value: 'planning', label: 'Načrtovanje' },
  { value: 'active', label: 'Aktivni' },
  { value: 'on_hold', label: 'Na čakanju' },
  { value: 'completed', label: 'Zaključeni' },
  { value: 'archived', label: 'Arhiv' },
] as const;

export default function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') ?? 'open';
  const sort = params.get('sort') ?? 'updated';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounced(search.trim(), 250);
  const [healthFilter, setHealthFilter] = useState<Health | null>(null);

  const filters: ProjectFilters = {
    search: debounced || undefined,
    sort,
    archived: scope === 'archived' ? 'true' : 'false',
    status: scope === 'open' ? ['planning', 'active', 'on_hold'] : scope === 'archived' ? undefined : [scope],
  };
  const { data, isPending, error, refetch, isFetching } = useProjects(filters);
  const creating = params.get('new') === '1';

  const update = (key: string, value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });

  const healthCounts = useMemo(() => {
    const counts: Partial<Record<Health, number>> = {};
    for (const p of data ?? []) counts[p.health] = (counts[p.health] ?? 0) + 1;
    return counts;
  }, [data]);
  const visible = (data ?? []).filter((p) => !healthFilter || p.health === healthFilter);

  return (
    <div className="page">
      <PageHeader
        title="Projekti"
        description="Pregled vseh projektov, v katerih sodelujete, z napredkom in stanjem rokov."
        actions={
          <Button variant="primary" icon="plus" onClick={() => update('new', '1')}>
            Nov projekt
          </Button>
        }
      />

      <div className="toolbar">
        <div className="toolbar-search">
          <Icon name="search" size={15} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Išči po imenu, oznaki ali opisu" aria-label="Išči projekte" />
        </div>
        <div className="tabs-inline" role="tablist" aria-label="Status projektov">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              role="tab"
              type="button"
              aria-selected={scope === s.value}
              className={cx('tab-inline', scope === s.value && 'is-active')}
              onClick={() => {
                setHealthFilter(null);
                update('scope', s.value === 'open' ? null : s.value);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Select size_="sm" value={sort} onChange={(e) => update('sort', e.target.value === 'updated' ? null : e.target.value)} aria-label="Razvrsti">
          <option value="updated">Nazadnje posodobljeni</option>
          <option value="due">Po roku</option>
          <option value="priority">Po prioriteti</option>
          <option value="progress">Po napredku</option>
          <option value="name">Po imenu</option>
          <option value="created">Najnovejši</option>
        </Select>
      </div>

      {data && data.length > 0 && scope !== 'archived' && (
        <div className="health-strip" role="group" aria-label="Filtriraj po stanju">
          {(['off_track', 'at_risk', 'on_track', 'paused', 'done'] as Health[])
            .filter((h) => healthCounts[h])
            .map((h) => (
              <button
                key={h}
                type="button"
                className={cx('health-chip', `health-${HEALTH[h].tone}`, healthFilter === h && 'is-active')}
                aria-pressed={healthFilter === h}
                onClick={() => setHealthFilter(healthFilter === h ? null : h)}
              >
                <span className="health-chip-dot" />
                {HEALTH[h].label}
                <strong className="tabular">{healthCounts[h]}</strong>
              </button>
            ))}
        </div>
      )}

      {error ? (
        <ErrorBlock message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="project-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="project-card">
              <Skeleton width="50%" height={18} />
              <Skeleton width="90%" />
              <Skeleton height={6} />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          art="projects"
          title={debounced || healthFilter ? 'Ni projektov, ki bi ustrezali filtru' : scope === 'archived' ? 'Arhiv je prazen' : 'Še nimate projektov'}
          description={
            debounced || healthFilter
              ? 'Spremenite iskalni niz ali počistite filtre.'
              : scope === 'archived'
                ? 'Arhivirani projekti ostanejo dostopni za branje in jih lahko kadarkoli obnovite.'
                : 'Ustvarite prvi projekt in povabite člane ekipe.'
          }
          action={
            debounced || healthFilter ? (
              <Button onClick={() => { setSearch(''); setHealthFilter(null); }}>Počisti filtre</Button>
            ) : scope !== 'archived' ? (
              <Button variant="primary" icon="plus" onClick={() => update('new', '1')}>
                Nov projekt
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cx('project-grid', isFetching && 'is-refreshing')}>
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <ProjectFormModal open={creating} onClose={() => update('new', null)} />
    </div>
  );
}

function ProjectCard({ project: p }: { project: Project }) {
  const projectHref = useProjectHref();
  const health = HEALTH[p.health];
  return (
    <Link to={projectHref(p.id)} className={cx('project-card', p.archivedAt && 'is-archived')} style={{ ['--project' as string]: p.color }}>
      <div className="project-card-head">
        <span className="project-key mono">{p.key}</span>
        {p.archivedAt ? <Badge>Arhiviran</Badge> : <Badge tone={health.tone} dot>{health.label}</Badge>}
      </div>
      <h3 className="project-card-title">{p.name}</h3>
      <p className="project-card-desc">{p.description || <span className="muted">Brez opisa</span>}</p>

      <div className="project-card-progress">
        <div className="row between">
          <span className="secondary">{PROJECT_STATUS_LABEL[p.status]}</span>
          <span className="tabular strong">{p.progress} %</span>
        </div>
        <ProgressBar value={p.progress} tone={health.tone === 'danger' ? 'danger' : health.tone === 'success' ? 'success' : 'accent'} label={`Napredek: ${p.progress} %`} />
      </div>

      <dl className="project-card-stats">
        <div>
          <dt>Odprte</dt>
          <dd className="tabular">{p.stats.open}</dd>
        </div>
        <div>
          <dt>Končane</dt>
          <dd className="tabular">{p.stats.done}</dd>
        </div>
        <div className={cx(p.stats.overdue > 0 && 'is-danger')}>
          <dt>Zamujene</dt>
          <dd className="tabular">{p.stats.overdue}</dd>
        </div>
      </dl>

      <div className="project-card-foot">
        <AvatarStack users={p.members ?? []} max={4} size={22} />
        <span className="project-card-meta">
          {p.dueDate ? (
            <span className={cx(p.isPastDue && p.status !== 'completed' && 'text-danger')}>
              Rok {formatDate(p.dueDate)}
              {p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 14 && p.status !== 'completed' && ` · še ${p.daysLeft} ${plural(p.daysLeft, ['dan', 'dneva', 'dnevi', 'dni'])}`}
            </span>
          ) : (
            <span className="muted">Brez roka</span>
          )}
          <span className="muted">
            {ROLE_LABEL[p.myRole]} · {PRIORITY_LABEL[p.priority]}
          </span>
        </span>
      </div>
    </Link>
  );
}
