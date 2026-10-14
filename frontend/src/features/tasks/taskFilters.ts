/** Filtri seznama nalog, shranjeni v URL (deljive povezave, shranjeni pogledi, gumb Nazaj). */
export const FILTER_KEYS = ['search', 'projectId', 'status', 'priority', 'assignee', 'label', 'due', 'sort', 'order', 'archived'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export const MULTI_KEYS: FilterKey[] = ['projectId', 'status', 'priority', 'assignee', 'label'];

export type TaskFilterValues = Partial<Record<FilterKey, string | string[]>>;

export function readFilters(params: URLSearchParams): TaskFilterValues {
  const out: TaskFilterValues = {};
  for (const key of FILTER_KEYS) {
    const raw = params.get(key);
    if (!raw) continue;
    out[key] = MULTI_KEYS.includes(key) ? raw.split(',').filter(Boolean) : raw;
  }
  return out;
}

export function writeFilters(params: URLSearchParams, filters: TaskFilterValues) {
  const next = new URLSearchParams(params);
  for (const key of FILTER_KEYS) next.delete(key);
  next.delete('page');
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value) ? value.length : value) next.set(key, Array.isArray(value) ? value.join(',') : value!);
  }
  return next;
}

export function multi(filters: TaskFilterValues, key: FilterKey): string[] {
  const v = filters[key];
  return Array.isArray(v) ? v : v ? [v] : [];
}

/** Število aktivnih filtrov (razvrščanje ne šteje). */
export function activeFilterCount(filters: TaskFilterValues) {
  return FILTER_KEYS.filter((k) => k !== 'sort' && k !== 'order' && (Array.isArray(filters[k]) ? (filters[k] as string[]).length : filters[k])).length;
}

export function sameFilters(a: TaskFilterValues, b: TaskFilterValues) {
  const norm = (f: TaskFilterValues) =>
    JSON.stringify(
      FILTER_KEYS.map((k) => {
        const v = f[k];
        return Array.isArray(v) ? [...v].sort().join(',') : (v ?? '');
      }),
    );
  return norm(a) === norm(b);
}
