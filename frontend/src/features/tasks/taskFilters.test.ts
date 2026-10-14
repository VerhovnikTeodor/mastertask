import { describe, expect, it } from 'vitest';
import { activeFilterCount, multi, readFilters, sameFilters, writeFilters } from './taskFilters';

describe('filtri v URL', () => {
  it('prebere enojne in večkratne vrednosti ter ignorira neznane ključe', () => {
    const params = new URLSearchParams('status=todo,in_progress&due=week&task=abc&foo=bar');
    expect(readFilters(params)).toEqual({ status: ['todo', 'in_progress'], due: 'week' });
  });

  it('zapis ohrani nefiltrske parametre, ponastavi stran in izpusti prazne vrednosti', () => {
    const params = new URLSearchParams('task=abc&page=3&priority=low');
    const next = writeFilters(params, { priority: [], assignee: ['me', 'none'], search: '' });
    expect(next.get('task')).toBe('abc');
    expect(next.has('page')).toBe(false);
    expect(next.has('priority')).toBe(false);
    expect(next.get('assignee')).toBe('me,none');
  });

  it('branje in zapis sta simetrična', () => {
    const filters = { projectId: ['a', 'b'], sort: 'due', order: 'asc' };
    expect(readFilters(writeFilters(new URLSearchParams(), filters))).toEqual(filters);
  });

  it('multi vedno vrne seznam', () => {
    expect(multi({ status: 'todo' }, 'status')).toEqual(['todo']);
    expect(multi({}, 'status')).toEqual([]);
  });

  it('razvrščanje ne šteje kot filter', () => {
    expect(activeFilterCount({ sort: 'due', order: 'asc', status: ['todo'], label: [] })).toBe(1);
  });

  it('primerjava ni občutljiva na vrstni red vrednosti', () => {
    expect(sameFilters({ status: ['done', 'todo'] }, { status: ['todo', 'done'] })).toBe(true);
    expect(sameFilters({ status: ['todo'] }, { status: ['todo'], due: 'week' })).toBe(false);
  });
});
