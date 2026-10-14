import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  ActivityEntry,
  Comment,
  DashboardData,
  Facets,
  Label,
  Notification,
  Paginated,
  Project,
  ProjectDetail,
  ProjectMember,
  SavedView,
  Task,
  TaskDetail,
  TaskPermissions,
  TeamMember,
  User,
  UserBrief,
} from '../lib/types';

export type TaskFilters = Record<string, string | string[] | number | undefined>;

export const keys = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  projects: (filters?: object) => ['projects', filters ?? {}] as const,
  project: (id: string) => ['project', id] as const,
  projectActivity: (id: string) => ['project', id, 'activity'] as const,
  board: (id: string) => ['board', id] as const,
  tasks: (filters?: object) => ['tasks', filters ?? {}] as const,
  task: (id: string) => ['task', id] as const,
  comments: (id: string) => ['task', id, 'comments'] as const,
  taskActivity: (id: string) => ['task', id, 'activity'] as const,
  facets: ['facets'] as const,
  users: (filters?: object) => ['users', filters ?? {}] as const,
  user: (id: string) => ['user', id] as const,
  notifications: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
  views: ['views'] as const,
  search: (q: string) => ['search', q] as const,
};

/** Po spremembi naloge osvežimo vse poglede, ki prikazujejo naloge ali statistiko. */
export function invalidateTaskViews(qc: QueryClient, projectId?: string, taskId?: string) {
  qc.invalidateQueries({ queryKey: ['tasks'] });
  qc.invalidateQueries({ queryKey: keys.dashboard });
  qc.invalidateQueries({ queryKey: ['projects'] });
  qc.invalidateQueries({ queryKey: ['users'] });
  if (projectId) {
    qc.invalidateQueries({ queryKey: keys.board(projectId) });
    qc.invalidateQueries({ queryKey: keys.project(projectId) });
  }
  if (taskId) qc.invalidateQueries({ queryKey: keys.task(taskId) });
}

// Avtentikacija ---------------------------------------------------------------
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>('/auth/me')).user;
      } catch (error) {
        if ((error as { status?: number }).status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Pick<User, 'firstName' | 'lastName' | 'jobTitle' | 'avatarColor' | 'preferences'>>) =>
      api.patch<{ user: User }>('/auth/me', data),
    onSuccess: ({ user }) => {
      qc.setQueryData(keys.me, user);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => api.post('/auth/change-password', data),
  });
}

// Nadzorna plošča -------------------------------------------------------------
export function useDashboard() {
  return useQuery({ queryKey: keys.dashboard, queryFn: () => api.get<DashboardData>('/dashboard') });
}

// Projekti ------------------------------------------------------------------
export interface ProjectFilters {
  search?: string;
  status?: string[];
  priority?: string[];
  archived?: 'true' | 'false' | 'all';
  role?: 'owner' | 'any';
  sort?: string;
}

export function useProjects(filters: ProjectFilters = {}) {
  return useQuery({
    queryKey: keys.projects(filters),
    queryFn: async () => (await api.get<{ items: Project[] }>('/projects', { ...filters })).items,
    placeholderData: keepPreviousData,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: keys.project(id ?? ''),
    queryFn: async () => (await api.get<{ project: ProjectDetail }>(`/projects/${id}`)).project,
    enabled: Boolean(id),
  });
}

export function useProjectActivity(id: string) {
  return useQuery({
    queryKey: keys.projectActivity(id),
    queryFn: async () => (await api.get<{ items: ActivityEntry[] }>(`/projects/${id}/activity`, { limit: 40 })).items,
  });
}

export interface ProjectInput {
  name?: string;
  key?: string;
  description?: string;
  status?: string;
  priority?: string;
  color?: string;
  startDate?: string | null;
  dueDate?: string | null;
  memberIds?: string[];
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectInput) => api.post<{ project: ProjectDetail }>('/projects', data),
    onSuccess: ({ project }) => {
      qc.setQueryData(keys.project(project.id), project);
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: keys.facets });
      qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

/** Skupen hook za vse operacije, ki vrnejo posodobljen projekt. */
function useProjectMutation<V>(projectId: string, fn: (vars: V) => Promise<{ project: ProjectDetail }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: ({ project }) => {
      qc.setQueryData(keys.project(projectId), project);
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: keys.board(projectId) });
      qc.invalidateQueries({ queryKey: keys.projectActivity(projectId) });
      qc.invalidateQueries({ queryKey: keys.dashboard });
      qc.invalidateQueries({ queryKey: keys.facets });
    },
  });
}

export function useUpdateProject(id: string) {
  return useProjectMutation(id, (data: ProjectInput) => api.patch(`/projects/${id}`, data));
}

export function useArchiveProject(id: string) {
  return useProjectMutation(id, (archive: boolean) => api.post(`/projects/${id}/${archive ? 'archive' : 'restore'}`));
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: keys.project(id) });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: keys.facets });
    },
  });
}

export function useColumnMutations(projectId: string) {
  const base = `/projects/${projectId}/columns`;
  return {
    create: useProjectMutation(projectId, (data: { name: string; category: string; color?: string; wipLimit?: number | null }) =>
      api.post(base, data),
    ),
    update: useProjectMutation(
      projectId,
      ({ id, ...data }: { id: string; name?: string; category?: string; color?: string; wipLimit?: number | null }) =>
        api.patch(`${base}/${id}`, data),
    ),
    reorder: useProjectMutation(projectId, (columnIds: string[]) => api.put(`${base}/order`, { columnIds })),
    remove: useProjectMutation(projectId, ({ id, moveTo }: { id: string; moveTo?: string }) =>
      api.delete(`${base}/${id}`, { moveTo }),
    ),
  };
}

export function useLabelMutations(projectId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.project(projectId) });
    qc.invalidateQueries({ queryKey: keys.board(projectId) });
    qc.invalidateQueries({ queryKey: keys.facets });
    qc.invalidateQueries({ queryKey: ['tasks'] });
  };
  return {
    create: useMutation({
      mutationFn: (data: { name: string; color: string }) => api.post<{ label: Label }>(`/projects/${projectId}/labels`, data),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string }) =>
        api.patch(`/projects/${projectId}/labels/${id}`, data),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/projects/${projectId}/labels/${id}`),
      onSuccess: refresh,
    }),
  };
}

export function useMemberMutations(projectId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.project(projectId) });
    qc.invalidateQueries({ queryKey: keys.projectActivity(projectId) });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: keys.board(projectId) });
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: keys.facets });
  };
  return {
    add: useMutation({
      mutationFn: (data: { userId: string; role: string }) =>
        api.post<{ members: ProjectMember[] }>(`/projects/${projectId}/members`, data),
      onSuccess: refresh,
    }),
    changeRole: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: string }) =>
        api.patch(`/projects/${projectId}/members/${userId}`, { role }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (userId: string) =>
        api.delete<{ unassignedTasks: number }>(`/projects/${projectId}/members/${userId}`),
      onSuccess: refresh,
    }),
  };
}

// Naloge ----------------------------------------------------------------------
export function useBoard(projectId: string) {
  return useQuery({
    queryKey: keys.board(projectId),
    queryFn: async () => (await api.get<{ tasks: Task[] }>(`/projects/${projectId}/board`)).tasks,
  });
}

export function useTasks(filters: TaskFilters, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.tasks(filters),
    queryFn: () => api.get<Paginated<Task>>('/tasks', filters as Record<string, string>),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useFacets() {
  return useQuery({ queryKey: keys.facets, queryFn: () => api.get<Facets>('/tasks/facets'), staleTime: 60_000 });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: keys.task(id ?? ''),
    queryFn: () => api.get<{ task: TaskDetail; permissions: TaskPermissions }>(`/tasks/${id}`),
    enabled: Boolean(id),
  });
}

export interface TaskInput {
  projectId?: string;
  title?: string;
  description?: string;
  columnId?: string;
  priority?: string;
  startDate?: string | null;
  dueDate?: string | null;
  assigneeIds?: string[];
  labelIds?: string[];
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TaskInput) => api.post<{ task: Task }>('/tasks', data),
    onSuccess: ({ task }) => invalidateTaskViews(qc, task.projectId),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: TaskInput & { id: string }) => api.patch<{ task: Task }>(`/tasks/${id}`, data),
    onSuccess: ({ task }) => {
      invalidateTaskViews(qc, task.projectId, task.id);
      qc.invalidateQueries({ queryKey: keys.taskActivity(task.id) });
    },
  });
}

/** Optimističen premik na tabli z vrnitvijo v prejšnje stanje ob napaki. */
export function useMoveTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, columnId, index }: { id: string; columnId: string; index: number; optimistic: Task[] }) =>
      api.post<{ task: Task }>(`/tasks/${id}/move`, { columnId, index }),
    onMutate: async ({ optimistic }) => {
      await qc.cancelQueries({ queryKey: keys.board(projectId) });
      const previous = qc.getQueryData<Task[]>(keys.board(projectId));
      qc.setQueryData(keys.board(projectId), optimistic);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(keys.board(projectId), context.previous);
    },
    onSettled: (data) => invalidateTaskViews(qc, projectId, data?.task.id),
  });
}

export function useTaskAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; projectId: string; action: 'archive' | 'restore' | 'delete' }) =>
      action === 'delete' ? api.delete(`/tasks/${id}`) : api.post(`/tasks/${id}/${action}`),
    onSuccess: (_d, { id, projectId, action }) => {
      if (action === 'delete') qc.removeQueries({ queryKey: keys.task(id) });
      invalidateTaskViews(qc, projectId, action === 'delete' ? undefined : id);
    },
  });
}

export function useTaskActivity(id: string) {
  return useQuery({
    queryKey: keys.taskActivity(id),
    queryFn: async () => (await api.get<{ items: ActivityEntry[] }>(`/tasks/${id}/activity`)).items,
  });
}

function useTaskSubMutation<V>(taskId: string, projectId: string, fn: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.task(taskId) });
      qc.invalidateQueries({ queryKey: keys.taskActivity(taskId) });
      qc.invalidateQueries({ queryKey: keys.board(projectId) });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useChecklist(taskId: string, projectId: string) {
  const base = `/tasks/${taskId}/checklist`;
  return {
    add: useTaskSubMutation(taskId, projectId, (content: string) => api.post(base, { content })),
    update: useTaskSubMutation(taskId, projectId, ({ id, ...data }: { id: string; content?: string; isDone?: boolean }) =>
      api.patch(`${base}/${id}`, data),
    ),
    remove: useTaskSubMutation(taskId, projectId, (id: string) => api.delete(`${base}/${id}`)),
  };
}

export function useDependencies(taskId: string, projectId: string) {
  return {
    add: useTaskSubMutation(taskId, projectId, (blockedById: string) =>
      api.post(`/tasks/${taskId}/dependencies`, { blockedById }),
    ),
    remove: useTaskSubMutation(taskId, projectId, (blockedById: string) =>
      api.delete(`/tasks/${taskId}/dependencies/${blockedById}`),
    ),
  };
}

export function useComments(taskId: string) {
  return useQuery({
    queryKey: keys.comments(taskId),
    queryFn: async () => (await api.get<{ items: Comment[] }>(`/tasks/${taskId}/comments`)).items,
  });
}

export function useCommentMutations(taskId: string, projectId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.comments(taskId) });
    qc.invalidateQueries({ queryKey: keys.taskActivity(taskId) });
    qc.invalidateQueries({ queryKey: keys.board(projectId) });
    qc.invalidateQueries({ queryKey: keys.task(taskId) });
  };
  return {
    add: useMutation({ mutationFn: (body: string) => api.post(`/tasks/${taskId}/comments`, { body }), onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: string }) => api.patch(`/comments/${id}`, { body }),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete(`/comments/${id}`), onSuccess: refresh }),
  };
}

// Ekipa -----------------------------------------------------------------------
export function useTeam(filters: { search?: string; includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: keys.users(filters),
    queryFn: async () =>
      (await api.get<{ items: TeamMember[] }>('/users', {
        search: filters.search,
        includeInactive: filters.includeInactive ? 'true' : undefined,
      })).items,
    placeholderData: keepPreviousData,
  });
}

export interface UserProfile extends Omit<User, 'preferences'> {
  projects: { id: string; name: string; key: string; color: string; role: string }[];
}

export function useUserProfile(id: string) {
  return useQuery({
    queryKey: keys.user(id),
    queryFn: async () => (await api.get<{ user: UserProfile }>(`/users/${id}`)).user,
  });
}

export function useAdminUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; role?: 'admin' | 'member'; isActive?: boolean }) =>
      api.patch(`/users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

// Obvestila, iskanje, pogledi ----------------------------------------------------
export function useNotifications() {
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => api.get<{ items: Notification[]; unreadCount: number }>('/notifications'),
  });
}

export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: keys.unread,
    queryFn: async () => (await api.get<{ unreadCount: number }>('/notifications/unread-count')).unreadCount,
    refetchInterval: 60_000,
    enabled,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { ids: string[] } | { all: true }) => api.post('/notifications/read', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export interface SearchResults {
  projects: { id: string; name: string; key: string; color: string; status: string; archived: boolean }[];
  tasks: { id: string; key: string; title: string; archived: boolean; status: { name: string; color: string }; project: { id: string; name: string; color: string } }[];
  people: (UserBrief & { jobTitle: string | null })[];
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: keys.search(q),
    queryFn: () => api.get<SearchResults>('/search', { q }),
    enabled: q.trim().length >= 1,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useSavedViews() {
  return useQuery({
    queryKey: keys.views,
    queryFn: async () => (await api.get<{ items: SavedView[] }>('/views')).items,
  });
}

export function useSavedViewMutations() {
  const qc = useQueryClient();
  return {
    save: useMutation({
      mutationFn: (data: { name: string; filters: Record<string, string | string[]> }) =>
        api.post<{ view: SavedView }>('/views', data),
      onSuccess: () => qc.invalidateQueries({ queryKey: keys.views }),
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/views/${id}`),
      onSuccess: () => qc.invalidateQueries({ queryKey: keys.views }),
    }),
  };
}
