import { describe, expect, it } from 'vitest';
import type { BoardColumn, Task } from '../../lib/types';
import { EMPTY_FILTERS, groupByColumn, isFiltered, matchesFilters, resolveDrop } from './boardLogic';

function task(id: string, columnId: string, position: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    projectId: 'p',
    number: 1,
    key: `T-${id}`,
    title: `Naloga ${id}`,
    priority: 'medium',
    columnId,
    position,
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
    archivedAt: null,
    status: { name: 'X', category: 'todo', color: '#000' },
    project: { id: 'p', name: 'P', key: 'T', color: '#000', archived: false },
    isOverdue: false,
    assignees: [],
    labels: [],
    checklist: { total: 0, done: 0 },
    commentCount: 0,
    openBlockers: 0,
    ...extra,
  };
}

const column = (id: string): BoardColumn => ({ id, name: id, category: 'todo', color: '#000', position: 0, wipLimit: null, taskCount: 0 });

describe('groupByColumn', () => {
  it('razvrsti po poziciji in pozna prazne stolpce', () => {
    const tasks = [task('b', 'c1', 2048), task('a', 'c1', 1024), task('c', 'c2', 1)];
    expect(groupByColumn(tasks, [column('c1'), column('c2'), column('c3')])).toEqual({ c1: ['a', 'b'], c2: ['c'], c3: [] });
  });

  it('ignorira naloge neznanih stolpcev', () => {
    expect(groupByColumn([task('x', 'gone', 1)], [column('c1')])).toEqual({ c1: [] });
  });
});

describe('resolveDrop', () => {
  const tasks = [task('a', 'c1', 1024), task('b', 'c1', 2048), task('c', 'c1', 3072), task('m', 'c2', 1024)];

  it('v prazen stolpec', () => {
    expect(resolveDrop(tasks, 'm', 'c3', ['m'])).toEqual({ index: 0, position: 1024 });
  });

  it('na začetek, med in na konec', () => {
    expect(resolveDrop(tasks, 'm', 'c1', ['m', 'a', 'b', 'c'])).toEqual({ index: 0, position: 0 });
    expect(resolveDrop(tasks, 'm', 'c1', ['a', 'm', 'b', 'c'])).toEqual({ index: 1, position: 1536 });
    expect(resolveDrop(tasks, 'm', 'c1', ['a', 'b', 'c', 'm'])).toEqual({ index: 3, position: 4096 });
  });

  it('premik znotraj stolpca ne šteje same sebe', () => {
    expect(resolveDrop(tasks, 'a', 'c1', ['b', 'a', 'c'])).toEqual({ index: 1, position: 2560 });
  });

  it('pri filtriranem prikazu uporabi soseda iz celotnega stolpca', () => {
    // Viden je le "c"; naloga spuščena pred njim mora pristati med b in c.
    expect(resolveDrop(tasks, 'm', 'c1', ['m', 'c'])).toEqual({ index: 2, position: 2560 });
  });
});

describe('matchesFilters', () => {
  const me = 'u1';
  const today = '2026-10-14';
  const weekEnd = '2026-10-21';
  const t = task('a', 'c1', 1, {
    title: 'Popravi prijavo',
    priority: 'high',
    dueDate: '2026-10-16',
    assignees: [{ id: me, firstName: 'A', lastName: 'B', email: 'a@b.si', avatarColor: '#000', isActive: true }],
    labels: [{ id: 'l1', name: 'Napaka', color: '#f00' }],
  });

  it('prazni filtri ujamejo vse', () => {
    expect(isFiltered(EMPTY_FILTERS)).toBe(false);
    expect(matchesFilters(t, EMPTY_FILTERS, me, today, weekEnd)).toBe(true);
  });

  it('iskanje po naslovu in ključu ne glede na velikost črk', () => {
    expect(matchesFilters(t, { ...EMPTY_FILTERS, search: 'PRIJAV' }, me, today, weekEnd)).toBe(true);
    expect(matchesFilters(t, { ...EMPTY_FILTERS, search: 't-a' }, me, today, weekEnd)).toBe(true);
    expect(matchesFilters(t, { ...EMPTY_FILTERS, search: 'odjava' }, me, today, weekEnd)).toBe(false);
  });

  it('odgovorni: jaz, nihče, konkretna oseba', () => {
    expect(matchesFilters(t, { ...EMPTY_FILTERS, assignees: ['me'] }, me, today, weekEnd)).toBe(true);
    expect(matchesFilters(t, { ...EMPTY_FILTERS, assignees: ['none'] }, me, today, weekEnd)).toBe(false);
    expect(matchesFilters(task('z', 'c1', 1), { ...EMPTY_FILTERS, assignees: ['none'] }, me, today, weekEnd)).toBe(true);
    expect(matchesFilters(t, { ...EMPTY_FILTERS, assignees: ['u2'] }, me, today, weekEnd)).toBe(false);
  });

  it('prioriteta, oznake in rok', () => {
    expect(matchesFilters(t, { ...EMPTY_FILTERS, priorities: ['low'] }, me, today, weekEnd)).toBe(false);
    expect(matchesFilters(t, { ...EMPTY_FILTERS, labels: ['l1'] }, me, today, weekEnd)).toBe(true);
    expect(matchesFilters(t, { ...EMPTY_FILTERS, due: 'week' }, me, today, weekEnd)).toBe(true);
    expect(matchesFilters(t, { ...EMPTY_FILTERS, due: 'none' }, me, today, weekEnd)).toBe(false);
    expect(matchesFilters(t, { ...EMPTY_FILTERS, due: 'overdue' }, me, today, weekEnd)).toBe(false);
  });
});
