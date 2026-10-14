import { useEffect, useState } from 'react';
import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { useArchiveProject, useProject } from '../../api/hooks';
import { useFeedback } from '../../context/feedback';
import { useWorkspace } from '../../layout/workspace';
import { AvatarStack, Badge, Button, cx, ErrorBlock, PageLoader, ProgressBar } from '../../components/ui';
import { errorMessage, ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { HEALTH, PROJECT_STATUS_LABEL, ROLE_LABEL, hasRole } from '../../lib/meta';
import type { ProjectDetail } from '../../lib/types';
import { NotFoundPage } from '../../pages/NotFound';
import { ProjectFormModal } from './ProjectFormModal';

export interface ProjectContext {
  project: ProjectDetail;
  canEdit: boolean;
  canManage: boolean;
  isOwner: boolean;
}

export function useProjectContext() {
  return useOutletContext<ProjectContext>();
}

export default function ProjectLayout() {
  const { projectId = '' } = useParams();
  const { data: project, isPending, error, refetch } = useProject(projectId);
  const { setCurrentProjectId, openComposer } = useWorkspace();
  const archive = useArchiveProject(projectId);
  const { success, error: showError } = useFeedback();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setCurrentProjectId(project && !project.archivedAt ? projectId : null);
    return () => setCurrentProjectId(null);
  }, [projectId, project, setCurrentProjectId]);

  if (isPending) return <PageLoader label="Nalagam projekt …" />;
  if (error instanceof ApiError && error.status === 404) {
    return <NotFoundPage title="Projekt ne obstaja" message="Projekt je bil izbrisan ali pa niste več njegov član." />;
  }
  if (error || !project) return <div className="page"><ErrorBlock message={errorMessage(error)} onRetry={() => refetch()} /></div>;

  const archived = Boolean(project.archivedAt);
  const ctx: ProjectContext = {
    project,
    canEdit: !archived && hasRole(project.myRole, 'member'),
    canManage: !archived && hasRole(project.myRole, 'manager'),
    isOwner: project.myRole === 'owner',
  };
  const health = HEALTH[project.health];

  const restore = async () => {
    try {
      await archive.mutateAsync(false);
      success('Projekt obnovljen');
    } catch (err) {
      showError(err);
    }
  };

  const tabs = [
    { to: '', label: 'Tabla', end: true },
    { to: 'list', label: 'Seznam' },
    { to: 'overview', label: 'Pregled' },
    { to: 'members', label: `Člani · ${project.members.length}` },
    ...(hasRole(project.myRole, 'manager') ? [{ to: 'settings', label: 'Nastavitve' }] : []),
  ];

  return (
    <div className="project-page" style={{ ['--project' as string]: project.color }}>
      {archived && (
        <div className="banner banner-warning" role="status">
          <span>
            <strong>Projekt je arhiviran.</strong> Vsebina je na voljo samo za branje.
          </span>
          {ctx.isOwner && (
            <Button size="sm" onClick={restore} loading={archive.isPending}>
              Obnovi projekt
            </Button>
          )}
        </div>
      )}
      <header className="project-header">
        <div className="project-header-main">
          <span className="project-avatar" aria-hidden="true">
            {project.key.slice(0, 2)}
          </span>
          <div className="stack" style={{ minWidth: 0 }}>
            <div className="row gap-2 wrap">
              <span className="mono muted">{project.key}</span>
              <Badge tone={health.tone} dot>
                {health.label}
              </Badge>
              <Badge>{PROJECT_STATUS_LABEL[project.status]}</Badge>
            </div>
            <h1 className="project-title truncate">{project.name}</h1>
          </div>
        </div>
        <div className="project-header-side">
          <div className="project-header-progress">
            <span className="tabular">
              <strong>{project.progress} %</strong> · {project.stats.done}/{project.stats.total} nalog
            </span>
            <ProgressBar value={project.progress} size="sm" tone={health.tone === 'danger' ? 'danger' : 'accent'} label="Napredek projekta" />
          </div>
          <div className="project-header-meta">
            <span>{project.dueDate ? `Rok ${formatDate(project.dueDate)}` : 'Brez roka'}</span>
            <span className="muted">Vaša vloga: {ROLE_LABEL[project.myRole]}</span>
          </div>
          <AvatarStack users={project.members} max={4} size={26} />
          {ctx.canManage && (
            <Button size="sm" onClick={() => setEditing(true)}>
              Uredi
            </Button>
          )}
          {ctx.canEdit && (
            <Button size="sm" variant="primary" icon="plus" onClick={() => openComposer({ projectId })}>
              Naloga
            </Button>
          )}
        </div>
      </header>
      <nav className="project-tabs" aria-label="Pogledi projekta">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('project-tab', isActive && 'is-active')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={ctx} />
      <ProjectFormModal open={editing} onClose={() => setEditing(false)} project={project} />
    </div>
  );
}
