import type { ColumnCategory, Health, Priority, ProjectRole, ProjectStatus } from './types';

export const PRIORITIES: { value: Priority; label: string; short: string }[] = [
  { value: 'urgent', label: 'Nujna', short: 'Nujno' },
  { value: 'high', label: 'Visoka', short: 'Visoka' },
  { value: 'medium', label: 'Srednja', short: 'Srednja' },
  { value: 'low', label: 'Nizka', short: 'Nizka' },
];
export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.label])) as Record<Priority, string>;

export const CATEGORIES: { value: ColumnCategory; label: string }[] = [
  { value: 'todo', label: 'Za narediti' },
  { value: 'in_progress', label: 'V teku' },
  { value: 'done', label: 'Končano' },
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<ColumnCategory, string>;

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'planning', label: 'Načrtovanje' },
  { value: 'active', label: 'Aktiven' },
  { value: 'on_hold', label: 'Na čakanju' },
  { value: 'completed', label: 'Zaključen' },
];
export const PROJECT_STATUS_LABEL = Object.fromEntries(PROJECT_STATUSES.map((s) => [s.value, s.label])) as Record<
  ProjectStatus,
  string
>;

export const HEALTH: Record<Health, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'accent' }> = {
  on_track: { label: 'Po načrtu', tone: 'success' },
  at_risk: { label: 'Potrebuje pozornost', tone: 'warning' },
  off_track: { label: 'Zamuja', tone: 'danger' },
  paused: { label: 'Na čakanju', tone: 'neutral' },
  done: { label: 'Zaključen', tone: 'accent' },
};

export const ROLES: { value: ProjectRole; label: string; description: string }[] = [
  { value: 'owner', label: 'Lastnik', description: 'Polni nadzor, arhiviranje in brisanje projekta.' },
  { value: 'manager', label: 'Vodja', description: 'Ureja projekt, člane, stolpce in vse naloge.' },
  { value: 'member', label: 'Član', description: 'Ustvarja, ureja in premika naloge.' },
  { value: 'viewer', label: 'Opazovalec', description: 'Vidi projekt in komentira.' },
];
export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label])) as Record<ProjectRole, string>;
const ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, member: 2, manager: 3, owner: 4 };
export const hasRole = (role: ProjectRole | undefined, min: ProjectRole) => (role ? ROLE_RANK[role] >= ROLE_RANK[min] : false);

export const PALETTE = ['#3E63DD', '#0D9488', '#12A594', '#30A46C', '#E5484D', '#F76B15', '#D6409F', '#8E4EC6', '#E2A336', '#8B8D98'];
