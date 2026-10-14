import { describe, expect, it } from 'vitest';
import { addDays, daysFromToday, dueInfo, initials, plural, pluralDays, toISODate } from './format';

describe('datumi', () => {
  it('toISODate uporablja lokalni čas, ne UTC', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('addDays prečka meje mesecev in let', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('daysFromToday ni občutljiv na premik ure', () => {
    expect(daysFromToday('2026-03-30', '2026-03-28')).toBe(2);
    expect(daysFromToday('2026-10-20', '2026-10-27')).toBe(-7);
  });
});

describe('dueInfo', () => {
  const today = '2026-10-14';
  it('brez roka vrne null', () => expect(dueInfo(null, false, today)).toBeNull());
  it('zamuda', () => {
    expect(dueInfo('2026-10-13', false, today)).toEqual({ label: 'Včeraj', tone: 'overdue' });
    expect(dueInfo('2026-10-12', false, today)).toEqual({ label: '2 dneva zamude', tone: 'overdue' });
    expect(dueInfo('2026-10-09', false, today)?.label).toBe('5 dni zamude');
  });
  it('danes, jutri in kmalu', () => {
    expect(dueInfo(today, false, today)?.tone).toBe('today');
    expect(dueInfo('2026-10-15', false, today)).toEqual({ label: 'Jutri', tone: 'soon' });
    expect(dueInfo('2026-10-17', false, today)?.tone).toBe('soon');
    expect(dueInfo('2026-10-25', false, today)?.tone).toBe('normal');
  });
  it('dokončana naloga nikoli ne zamuja', () => {
    expect(dueInfo('2026-10-01', true, today)?.tone).toBe('done');
  });
});

describe('slovenske množinske oblike', () => {
  const forms: [string, string, string, string] = ['naloga', 'nalogi', 'naloge', 'nalog'];
  it.each([
    [1, 'naloga'],
    [2, 'nalogi'],
    [3, 'naloge'],
    [4, 'naloge'],
    [5, 'nalog'],
    [0, 'nalog'],
    [101, 'naloga'],
    [102, 'nalogi'],
    [111, 'nalog'],
  ])('%i → %s', (n, expected) => expect(plural(n, forms)).toBe(expected));

  it('pluralDays', () => {
    expect([1, 2, 3, 5].map(pluralDays)).toEqual(['dan', 'dneva', 'dnevi', 'dni']);
  });
});

it('initials', () => {
  expect(initials({ firstName: 'ana', lastName: 'Novak' })).toBe('AN');
  expect(initials({ firstName: '', lastName: '' })).toBe('');
});
