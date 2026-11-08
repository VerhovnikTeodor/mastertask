import Clarity from '@microsoft/clarity';

// Analitika (Microsoft Clarity) teče samo v produkcijskem buildu.
const enabled = import.meta.env.PROD;
const PROJECT_ID = 'zag4we6wah';

export type AnalyticsEvent =
  | 'login'
  | 'register'
  | 'logout'
  | 'project_created'
  | 'project_updated'
  | 'project_archived'
  | 'project_restored'
  | 'project_deleted'
  | 'task_created'
  | 'task_updated'
  | 'task_moved'
  | 'task_archived'
  | 'task_restored'
  | 'task_deleted'
  | 'comment_added'
  | 'member_added'
  | 'saved_view_created';

/** Napaka analitike (npr. blokirana skripta) ne sme nikoli zrušiti aplikacije. */
function safely(fn: () => void) {
  if (!enabled) return;
  try {
    fn();
  } catch {
    // ignoriramo
  }
}

export function initAnalytics() {
  safely(() => Clarity.init(PROJECT_ID));
}

export function track(event: AnalyticsEvent) {
  safely(() => Clarity.event(event));
}

/** Poveže sejo s prijavljenim uporabnikom (samo interni ID, brez e-pošte ali imena). */
export function identifyUser(user: { id: string; role: string } | null) {
  if (!user) return;
  safely(() => {
    Clarity.identify(user.id);
    Clarity.setTag('role', user.role);
  });
}
