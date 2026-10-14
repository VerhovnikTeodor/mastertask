const LOCALE = 'sl-SI';

/** Lokalni datum v obliki YYYY-MM-DD (brez pretvorbe v UTC). */
export function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISODate(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Razlika v dnevih med datumom in danes (pozitivno = v prihodnosti). */
export function daysFromToday(iso: string, today = todayISO()) {
  const ms = parseISODate(iso).getTime() - parseISODate(today).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  if (!iso) return '';
  const date = iso.length === 10 ? parseISODate(iso) : new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(LOCALE, sameYear ? opts : { ...opts, year: 'numeric' });
}

export function formatDateLong(iso: string | null | undefined) {
  return formatDate(iso, { weekday: 'short', day: 'numeric', month: 'long' });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'normal' | 'done';

export function dueInfo(iso: string | null, isDone = false, today = todayISO()): { label: string; tone: DueTone } | null {
  if (!iso) return null;
  const diff = daysFromToday(iso, today);
  if (isDone) return { label: formatDate(iso), tone: 'done' };
  if (diff < 0) {
    const n = Math.abs(diff);
    return { label: n === 1 ? 'Včeraj' : `${n} ${pluralDays(n)} zamude`, tone: 'overdue' };
  }
  if (diff === 0) return { label: 'Danes', tone: 'today' };
  if (diff === 1) return { label: 'Jutri', tone: 'soon' };
  if (diff <= 3) return { label: `Čez ${diff} dni`, tone: 'soon' };
  return { label: formatDate(iso), tone: 'normal' };
}

export function pluralDays(n: number) {
  const mod = n % 100;
  if (mod === 1) return 'dan';
  if (mod === 2) return 'dneva';
  if (mod === 3 || mod === 4) return 'dnevi';
  return 'dni';
}

/** Slovenska dvojina/množina: plural(n, ['naloga', 'nalogi', 'naloge', 'nalog']). */
export function plural(n: number, forms: [string, string, string, string]) {
  const mod = n % 100;
  if (mod === 1) return forms[0];
  if (mod === 2) return forms[1];
  if (mod === 3 || mod === 4) return forms[2];
  return forms[3];
}

export function timeAgo(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'pravkar';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `pred ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `pred ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'včeraj';
  if (days < 7) return `pred ${days} dnevi`;
  return formatDate(iso);
}

export function fullName(user: { firstName: string; lastName: string } | null | undefined) {
  return user ? `${user.firstName} ${user.lastName}` : 'Neznan uporabnik';
}

export function initials(user: { firstName: string; lastName: string }) {
  return `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
}
