import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/auth';
import { FeedbackProvider } from './context/feedback';
import { AppShell } from './layout/AppShell';
import { PageLoader } from './components/ui';
import { ErrorBoundary } from './pages/ErrorBoundary';
import { LoginPage, RegisterPage } from './features/auth/AuthPages';
import { NotFoundPage } from './pages/NotFound';

const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));
const ProjectsPage = lazy(() => import('./features/projects/ProjectsPage'));
const ProjectLayout = lazy(() => import('./features/projects/ProjectLayout'));
const ProjectBoardTab = lazy(() => import('./features/board/BoardTab'));
const ProjectListTab = lazy(() => import('./features/projects/ProjectListTab'));
const ProjectOverviewTab = lazy(() => import('./features/projects/ProjectOverviewTab'));
const ProjectMembersTab = lazy(() => import('./features/projects/ProjectMembersTab'));
const ProjectSettingsTab = lazy(() => import('./features/projects/ProjectSettingsTab'));
const TasksPage = lazy(() => import('./features/tasks/TasksPage'));
const CalendarPage = lazy(() => import('./features/calendar/CalendarPage'));
const TeamPage = lazy(() => import('./features/team/TeamPage'));
const MemberPage = lazy(() => import('./features/team/MemberPage'));
const NotificationsPage = lazy(() => import('./features/notifications/NotificationsPage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader label="Preverjam sejo …" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader label="Preverjam sejo …" />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <FeedbackProvider>
      <AuthProvider>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route index element={<Lazy><DashboardPage /></Lazy>} />
              <Route path="projects" element={<Lazy><ProjectsPage /></Lazy>} />
              <Route path="projects/:projectId" element={<Lazy><ProjectLayout /></Lazy>}>
                <Route index element={<Lazy><ProjectBoardTab /></Lazy>} />
                <Route path="list" element={<Lazy><ProjectListTab /></Lazy>} />
                <Route path="overview" element={<Lazy><ProjectOverviewTab /></Lazy>} />
                <Route path="members" element={<Lazy><ProjectMembersTab /></Lazy>} />
                <Route path="settings" element={<Lazy><ProjectSettingsTab /></Lazy>} />
              </Route>
              <Route path="tasks" element={<Lazy><TasksPage /></Lazy>} />
              <Route path="calendar" element={<Lazy><CalendarPage /></Lazy>} />
              <Route path="team" element={<Lazy><TeamPage /></Lazy>} />
              <Route path="team/:userId" element={<Lazy><MemberPage /></Lazy>} />
              <Route path="notifications" element={<Lazy><NotificationsPage /></Lazy>} />
              <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </FeedbackProvider>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}
