export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed';
export type ColumnCategory = 'todo' | 'in_progress' | 'done';
export type ProjectRole = 'owner' | 'manager' | 'member' | 'viewer';
export type Health = 'on_track' | 'at_risk' | 'off_track' | 'paused' | 'done';

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  density?: 'comfortable' | 'compact';
  defaultTaskView?: 'board' | 'list';
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  role: 'admin' | 'member';
  avatarColor: string;
  isActive: boolean;
  preferences: UserPreferences;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserBrief {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarColor: string;
  isActive: boolean;
}

export interface Workload {
  openTasks: number;
  inProgress: number;
  overdue: number;
  dueSoon: number;
  sharedProjects: number;
}

export interface TeamMember extends Omit<User, 'preferences'> {
  workload: Workload;
}

export interface ProjectStats {
  total: number;
  done: number;
  inProgress: number;
  open: number;
  overdue: number;
  dueSoon: number;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  color: string;
  startDate: string | null;
  dueDate: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isPastDue: boolean;
  daysLeft: number | null;
  stats: ProjectStats;
  progress: number;
  health: Health;
  myRole: ProjectRole;
  members?: UserBrief[];
  memberCount?: number;
}

export interface BoardColumn {
  id: string;
  name: string;
  category: ColumnCategory;
  color: string;
  position: number;
  wipLimit: number | null;
  taskCount: number;
}

export interface ProjectMember extends UserBrief {
  jobTitle: string | null;
  role: ProjectRole;
  joinedAt: string;
  openTasks: number;
  overdueTasks: number;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  taskCount?: number;
}

export interface ProjectDetail extends Project {
  createdBy: UserBrief | null;
  columns: BoardColumn[];
  members: ProjectMember[];
  labels: Label[];
}

export interface TaskStatusRef {
  id?: string;
  name: string;
  category: ColumnCategory;
  color: string;
}

export interface Task {
  id: string;
  projectId: string;
  number: number;
  key: string;
  title: string;
  priority: Priority;
  columnId: string;
  position: number;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  status: TaskStatusRef;
  project: { id: string; name: string; key: string; color: string; archived: boolean };
  isOverdue: boolean;
  assignees: UserBrief[];
  labels: Label[];
  checklist: { total: number; done: number };
  commentCount: number;
  openBlockers: number;
}

export interface TaskRef {
  id: string;
  key: string;
  title: string;
  status: TaskStatusRef;
}

export interface ChecklistItem {
  id: string;
  content: string;
  isDone: boolean;
  position: number;
  createdAt: string;
}

export interface TaskDetail extends Task {
  description: string;
  createdBy: UserBrief | null;
  checklistItems: ChecklistItem[];
  blockedBy: TaskRef[];
  blocking: TaskRef[];
}

export interface TaskPermissions {
  role: ProjectRole;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canComment: boolean;
}

export interface Comment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  author: UserBrief;
}

export interface ActivityEntry {
  id: number;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
  actor: UserBrief | null;
  project: { id: string; name: string; key: string; color: string };
  task: { id: string; key: string; title: string } | null;
}

export interface Notification {
  id: string;
  type: 'task_assigned' | 'comment_added' | 'project_added' | 'task_completed' | string;
  details: Record<string, string>;
  readAt: string | null;
  createdAt: string;
  actor: UserBrief | null;
  project: { id: string; name: string; key: string; color: string } | null;
  task: { id: string; key: string; title: string } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SavedView {
  id: string;
  name: string;
  filters: Record<string, string | string[]>;
  createdAt: string;
}

export interface Facets {
  projects: { id: string; name: string; key: string; color: string; archived: boolean }[];
  members: UserBrief[];
  labels: { value: string; name: string; color: string }[];
}

export interface DashboardData {
  stats: {
    myOpen: number;
    myInProgress: number;
    myOverdue: number;
    myDueSoon: number;
    myCompletedWeek: number;
    teamOverdue: number;
    activeProjects: number;
    projectsNeedingAttention: number;
  };
  myTasks: Task[];
  upcoming: Task[];
  overdue: Task[];
  recentlyUpdated: Task[];
  throughput: { day: string; completed: number; created: number }[];
  projects: Project[];
  activity: ActivityEntry[];
}
