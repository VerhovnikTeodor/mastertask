import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSavedViewMutations, useSavedViews } from '../../api/hooks';
import { useFeedback } from '../../context/feedback';
import { useWorkspace } from '../../layout/workspace';
import { PageHeader } from '../../components/common';
import { Button, cx, Field, Input } from '../../components/ui';
import { Modal } from '../../components/overlays';
import { Icon } from '../../components/Icon';
import { TaskListView } from './TaskListView';
import { activeFilterCount, readFilters, sameFilters, writeFilters, type TaskFilterValues } from './taskFilters';

const PRESETS: { id: string; label: string; filters: TaskFilterValues }[] = [
  { id: 'all', label: 'Vse naloge', filters: {} },
  { id: 'mine', label: 'Moje', filters: { assignee: ['me'] } },
  { id: 'mine-open', label: 'Moje odprte', filters: { assignee: ['me'], status: ['todo', 'in_progress'] } },
  { id: 'overdue', label: 'Zamujene', filters: { due: 'overdue' } },
  { id: 'week', label: 'Rok ta teden', filters: { due: 'week', status: ['todo', 'in_progress'] } },
  { id: 'unassigned', label: 'Nedodeljene', filters: { assignee: ['none'], status: ['todo', 'in_progress'] } },
];

export default function TasksPage() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const views = useSavedViews();
  const { save, remove } = useSavedViewMutations();
  const { success, error, confirm } = useFeedback();
  const { openComposer } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const mine = sameFilters(filters, { assignee: ['me'] });
  const apply = (f: TaskFilterValues) => setParams((prev) => writeFilters(prev, f));
  const presets = PRESETS;
  const current = presets.find((p) => sameFilters(filters, p.filters));
  const currentView = views.data?.find((v) => sameFilters(filters, v.filters as TaskFilterValues));
  const canSave = activeFilterCount(filters) > 0 && !current && !currentView;

  const saveView = async () => {
    if (!name.trim()) return;
    try {
      await save.mutateAsync({ name: name.trim(), filters: filters as Record<string, string | string[]> });
      success('Pogled shranjen', `»${name.trim()}« je zdaj na voljo med pogledi.`);
      setSaving(false);
      setName('');
    } catch (err) {
      error(err, 'Pogleda ni bilo mogoče shraniti');
    }
  };

  const deleteView = async (id: string, viewName: string) => {
    if (!(await confirm({ title: 'Izbriši pogled', description: `Shranjeni pogled »${viewName}« bo izbrisan. Naloge ostanejo nespremenjene.`, confirmLabel: 'Izbriši' }))) return;
    remove.mutate(id, { onError: (err) => error(err), onSuccess: () => success('Pogled izbrisan') });
  };

  return (
    <div className="page page-wide">
      <PageHeader
        title={mine ? 'Moje naloge' : 'Naloge'}
        description={mine ? 'Naloge, za katere ste odgovorni, v vseh projektih.' : 'Vse naloge iz projektov, v katerih sodelujete.'}
        actions={
          <Button variant="primary" icon="plus" onClick={() => openComposer()}>
            Nova naloga
          </Button>
        }
      />
      <div className="views-bar" role="tablist" aria-label="Pogledi">
        {presets.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={current?.id === p.id} className={cx('view-tab', current?.id === p.id && 'is-active')} onClick={() => apply(p.filters)}>
            {p.label}
          </button>
        ))}
        {views.data && views.data.length > 0 && <span className="views-sep" aria-hidden="true" />}
        {views.data?.map((v) => (
          <span key={v.id} className={cx('view-tab view-tab-saved', currentView?.id === v.id && 'is-active')}>
            <button type="button" role="tab" aria-selected={currentView?.id === v.id} onClick={() => apply(v.filters as TaskFilterValues)}>
              {v.name}
            </button>
            <button type="button" className="view-tab-remove" aria-label={`Izbriši pogled ${v.name}`} onClick={() => deleteView(v.id, v.name)}>
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        {canSave && (
          <button type="button" className="view-tab view-tab-add" onClick={() => setSaving(true)}>
            <Icon name="plus" size={13} />
            Shrani pogled
          </button>
        )}
      </div>

      <TaskListView emptyAction={<Button variant="primary" icon="plus" onClick={() => openComposer()}>Nova naloga</Button>} />

      <Modal
        open={saving}
        onClose={() => setSaving(false)}
        title="Shrani pogled"
        description="Trenutna kombinacija filtrov in razvrščanja bo shranjena za hiter dostop."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaving(false)}>
              Prekliči
            </Button>
            <Button variant="primary" onClick={saveView} loading={save.isPending} disabled={!name.trim()}>
              Shrani
            </Button>
          </>
        }
      >
        <Field label="Ime pogleda" htmlFor="view-name">
          <Input id="view-name" data-autofocus value={name} maxLength={60} placeholder="npr. Nujne naloge ekipe" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveView()} />
        </Field>
      </Modal>
    </div>
  );
}
