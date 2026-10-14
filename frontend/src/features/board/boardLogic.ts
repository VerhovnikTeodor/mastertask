import type { BoardColumn, Task } from '../../lib/types';

export type Containers = Record<string, string[]>;

export function groupByColumn(tasks: Task[], columns: BoardColumn[]): Containers {
  const result: Containers = Object.fromEntries(columns.map((c) => [c.id, [] as string[]]));
  const sorted = [...tasks].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  for (const t of sorted) {
    if (result[t.columnId]) result[t.columnId].push(t.id);
  }
  return result;
}

const STEP = 1024;

/**
 * Pretvori položaj v (morda filtriranem) prikazu v indeks v celotnem stolpcu, kot ga pričakuje API,
 * in izračuna optimistično pozicijo, enako kot strežnik.
 */
export function resolveDrop(
  allTasks: Task[],
  movedId: string,
  columnId: string,
  visibleOrder: string[],
): { index: number; position: number } {
  const full = allTasks
    .filter((t) => t.columnId === columnId && t.id !== movedId)
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  const at = visibleOrder.indexOf(movedId);
  const prevId = at > 0 ? visibleOrder[at - 1] : null;
  const nextId = at >= 0 && at < visibleOrder.length - 1 ? visibleOrder[at + 1] : null;

  let index: number;
  if (prevId && full.some((t) => t.id === prevId)) index = full.findIndex((t) => t.id === prevId) + 1;
  else if (nextId && full.some((t) => t.id === nextId)) index = full.findIndex((t) => t.id === nextId);
  else index = at <= 0 ? 0 : full.length;

  const prev = full[index - 1]?.position;
  const next = full[index]?.position;
  let position: number;
  if (prev === undefined && next === undefined) position = STEP;
  else if (prev === undefined) position = next! - STEP;
  else if (next === undefined) position = prev + STEP;
  else position = (prev + next) / 2;
  return { index, position };
}

export interface BoardFilterState {
  search: string;
  assignees: string[];
  priorities: string[];
  labels: string[];
  due: '' | 'overdue' | 'week' | 'none';
}

export const EMPTY_FILTERS: BoardFilterState = { search: '', assignees: [], priorities: [], labels: [], due: '' };

export function isFiltered(f: BoardFilterState) {
  return Boolean(f.search.trim() || f.assignees.length || f.priorities.length || f.labels.length || f.due);
}

export function matchesFilters(task: Task, f: BoardFilterState, meId: string, today: string, weekEnd: string) {
  const q = f.search.trim().toLowerCase();
  if (q && !task.title.toLowerCase().includes(q) && !task.key.toLowerCase().includes(q)) return false;
  if (f.priorities.length && !f.priorities.includes(task.priority)) return false;
  if (f.labels.length && !task.labels.some((l) => f.labels.includes(l.id))) return false;
  if (f.assignees.length) {
    const ids = task.assignees.map((a) => a.id);
    const ok = f.assignees.some((a) => (a === 'none' ? ids.length === 0 : ids.includes(a === 'me' ? meId : a)));
    if (!ok) return false;
  }
  if (f.due === 'overdue' && !task.isOverdue) return false;
  if (f.due === 'week' && !(task.dueDate && task.dueDate >= today && task.dueDate <= weekEnd)) return false;
  if (f.due === 'none' && task.dueDate) return false;
  return true;
}
