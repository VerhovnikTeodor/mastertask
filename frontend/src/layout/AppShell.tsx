import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useProjectHref } from '../context/auth';
import { useFeedback } from '../context/feedback';
import { useProjects, useUnreadCount } from '../api/hooks';
import { Avatar, cx, Kbd } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { Menu } from '../components/overlays';
import { fullName, plural } from '../lib/format';
import { useWorkspace, WorkspaceProvider } from './workspace';
import { CommandPalette } from './CommandPalette';
import { ShortcutsDialog, useGlobalShortcuts } from './shortcuts';
import { TaskDrawerHost } from '../features/tasks/TaskDrawer';
import { CreateTaskModal } from '../features/tasks/CreateTaskModal';

export function AppShell() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

function Shell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useGlobalShortcuts();

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className={cx('shell', navOpen && 'nav-open')}>
      <a href="#main" className="skip-link">
        Preskoči na vsebino
      </a>
      <Sidebar onNavigate={() => setNavOpen(false)} />
      <div className="nav-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />
      <div className="shell-main">
        <header className="mobile-bar">
          <button type="button" className="icon-btn icon-btn-md" aria-label="Odpri meni" onClick={() => setNavOpen(true)}>
            <Icon name="menu" />
          </button>
          <Link to="/" className="brand brand-mobile">
            <BrandMark />
            MasterTask
          </Link>
          <MobileActions />
        </header>
        <main id="main" ref={mainRef} className="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <TaskDrawerHost />
      <CreateTaskModal />
      <CommandPalette />
      <ShortcutsDialog />
    </div>
  );
}

function MobileActions() {
  const { openSearch, openComposer } = useWorkspace();
  return (
    <div className="row gap-1">
      <button type="button" className="icon-btn icon-btn-md" aria-label="Iskanje" onClick={openSearch}>
        <Icon name="search" />
      </button>
      <button type="button" className="icon-btn icon-btn-md" aria-label="Nova naloga" onClick={() => openComposer()}>
        <Icon name="plus" />
      </button>
    </div>
  );
}

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function NavItem({ to, icon, label, end, badge, isActive }: { to: string; icon: IconName; label: string; end?: boolean; badge?: number; isActive?: boolean }) {
  const content = (
    <>
      <Icon name={icon} size={16} />
      <span className="grow truncate">{label}</span>
      {badge ? <span className="nav-badge tabular">{badge > 99 ? '99+' : badge}</span> : null}
    </>
  );
  // Ko aktivnost določimo sami (ista pot, različen poizvedbeni niz), NavLink označi obe povezavi.
  if (isActive !== undefined) {
    return (
      <Link to={to} className={cx('nav-item', isActive && 'is-active')} aria-current={isActive ? 'page' : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <NavLink to={to} end={end} className={({ isActive: routeActive }) => cx('nav-item', routeActive && 'is-active')}>
      {content}
    </NavLink>
  );
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { user, logout } = useAuth();
  const { openSearch, openComposer, openShortcuts } = useWorkspace();
  const { confirm, error } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();
  const projects = useProjects({ archived: 'false', sort: 'updated' });
  const unread = useUnreadCount(Boolean(user));
  const projectHref = useProjectHref();
  const params = new URLSearchParams(location.search);
  const onTasks = location.pathname === '/tasks';
  const mine = onTasks && params.get('assignee') === 'me' && [...params.keys()].filter((k) => k !== 'task').length === 1;

  if (!user) return null;

  const signOut = async () => {
    if (!(await confirm({ title: 'Odjava', description: 'Ali se želite odjaviti iz aplikacije MasterTask?', confirmLabel: 'Odjava', tone: 'primary' }))) return;
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      error(err);
    }
  };

  return (
    <aside className="sidebar" aria-label="Glavna navigacija">
      <div className="sidebar-top">
        <Link to="/" className="brand" onClick={onNavigate}>
          <BrandMark />
          <span>MasterTask</span>
        </Link>
      </div>

      <div className="sidebar-actions">
        <button type="button" className="sidebar-search" onClick={openSearch}>
          <Icon name="search" size={15} />
          <span className="grow">Iskanje</span>
          <Kbd>⌘K</Kbd>
        </button>
        <button type="button" className="btn btn-primary btn-md btn-block" onClick={() => openComposer()}>
          <Icon name="plus" size={15} />
          <span>Nova naloga</span>
        </button>
      </div>

      <nav className="sidebar-nav">
        <NavItem to="/" end icon="home" label="Nadzorna plošča" />
        <NavItem to="/tasks?assignee=me" icon="checklist" label="Moje naloge" isActive={mine} />
        <NavItem to="/tasks" icon="list" label="Vse naloge" isActive={onTasks && !mine} />
        <NavItem to="/calendar" icon="calendar" label="Koledar" />
        <NavItem to="/projects" end icon="folder" label="Projekti" />
        <NavItem to="/team" icon="users" label="Ekipa" />
        <NavItem to="/notifications" icon="bell" label="Obvestila" badge={unread.data} />
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-head">
          <span>Aktivni projekti</span>
          <Link to="/projects?new=1" className="icon-btn icon-btn-sm" aria-label="Nov projekt" title="Nov projekt">
            <Icon name="plus" size={14} />
          </Link>
        </div>
        <div className="sidebar-projects">
          {projects.data?.slice(0, 8).map((p) => (
            <NavLink
              key={p.id}
              to={projectHref(p.id)}
              className={cx('nav-project', location.pathname.startsWith(`/projects/${p.id}`) && 'is-active')}
            >
              <span className="project-dot" style={{ background: p.color }} />
              <span className="grow truncate">{p.name}</span>
              {p.stats.overdue > 0 && (
                <span className="nav-project-alert tabular" title={`${p.stats.overdue} ${plural(p.stats.overdue, ['zamujena naloga', 'zamujeni nalogi', 'zamujene naloge', 'zamujenih nalog'])}`}>
                  {p.stats.overdue}
                </span>
              )}
            </NavLink>
          ))}
          {projects.data && projects.data.length === 0 && <p className="sidebar-empty">Še nimate projektov.</p>}
        </div>
      </div>

      <div className="sidebar-footer">
        <Menu
          align="start"
          trigger={(props) => (
            <button type="button" className="user-button" {...props}>
              <Avatar user={user} size={28} />
              <span className="stack grow" style={{ minWidth: 0 }}>
                <span className="user-name truncate">{fullName(user)}</span>
                <span className="user-email truncate">{user.email}</span>
              </span>
              <Icon name="chevronDown" size={14} />
            </button>
          )}
          items={[
            { label: 'Nastavitve in profil', onSelect: () => navigate('/settings') },
            { label: 'Bližnjice na tipkovnici', hint: '?', onSelect: openShortcuts },
            'divider',
            { label: 'Odjava', onSelect: signOut, tone: 'danger' },
          ]}
        />
      </div>
    </aside>
  );
}
