import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useCreateTask, useProject, useProjects } from '../../api/hooks';
import { useFeedback } from '../../context/feedback';
import { useTaskDrawer, useWorkspace } from '../../layout/workspace';
import { Modal, Picker } from '../../components/overlays';
import { Avatar, AvatarStack, Button, Checkbox, EmptyState, Field, Input, LabelChip, Select, Textarea } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { fullName } from '../../lib/format';
import { PRIORITIES, hasRole } from '../../lib/meta';
import type { Priority } from '../../lib/types';

interface Draft {
  projectId: string;
  title: string;
  description: string;
  columnId: string;
  priority: Priority;
  startDate: string;
  dueDate: string;
  assigneeIds: string[];
  labelIds: string[];
}

export function CreateTaskModal() {
  const { composer, closeComposer } = useWorkspace();
  return (
    <Modal open={Boolean(composer)} onClose={closeComposer} title="Nova naloga" size="lg">
      {composer && <Composer initial={composer} onClose={closeComposer} />}
    </Modal>
  );
}

function Composer({ initial, onClose }: { initial: { projectId?: string; columnId?: string; dueDate?: string }; onClose: () => void }) {
  const projects = useProjects({ archived: 'false' });
  const writable = useMemo(() => (projects.data ?? []).filter((p) => hasRole(p.myRole, 'member')), [projects.data]);
  const create = useCreateTask();
  const { toast } = useFeedback();
  const { openTask } = useTaskDrawer();

  const [draft, setDraft] = useState<Draft>({
    projectId: initial.projectId ?? '',
    title: '',
    description: '',
    columnId: initial.columnId ?? '',
    priority: 'medium',
    startDate: '',
    dueDate: initial.dueDate ?? '',
    assigneeIds: [],
    labelIds: [],
  });
  const [another, setAnother] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    if (!writable.length) return;
    if (!writable.some((p) => p.id === draft.projectId)) setDraft((d) => ({ ...d, projectId: writable[0].id, columnId: '' }));
  }, [writable, draft.projectId]);

  const project = useProject(draft.projectId || undefined);
  const detail = project.data?.id === draft.projectId ? project.data : undefined;

  useEffect(() => {
    if (!detail) return;
    if (!detail.columns.some((c) => c.id === draft.columnId)) setDraft((d) => ({ ...d, columnId: detail.columns[0]?.id ?? '' }));
  }, [detail, draft.columnId]);

  const changeProject = (projectId: string) =>
    setDraft((d) => ({ ...d, projectId, columnId: '', assigneeIds: [], labelIds: [] }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!draft.title.trim()) next.title = 'Vpišite naslov naloge.';
    if (draft.startDate && draft.dueDate && draft.startDate > draft.dueDate) next.dueDate = 'Rok ne more biti pred začetkom.';
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      const { task } = await create.mutateAsync({
        projectId: draft.projectId,
        title: draft.title.trim(),
        description: draft.description.trim(),
        columnId: draft.columnId || undefined,
        priority: draft.priority,
        startDate: draft.startDate || null,
        dueDate: draft.dueDate || null,
        assigneeIds: draft.assigneeIds,
        labelIds: draft.labelIds,
      });
      toast({ tone: 'success', title: `Ustvarjena naloga ${task.key}`, description: task.title, action: { label: 'Odpri', onClick: () => openTask(task.id) } });
      if (another) setDraft((d) => ({ ...d, title: '', description: '' }));
      else onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else setErrors({ form: err instanceof Error ? err.message : 'Naloge ni bilo mogoče ustvariti.' });
    }
  };

  if (projects.isPending) return <div className="modal-pad muted">Nalagam projekte …</div>;
  if (!writable.length) {
    return (
      <EmptyState
        compact
        title="Ni projekta, v katerem bi lahko ustvarili nalogo"
        description="Naloge lahko ustvarjate v aktivnih projektih, kjer ste član z vlogo Član ali višjo. Ustvarite nov projekt ali prosite vodjo projekta za dostop."
        action={<Button onClick={onClose}>Zapri</Button>}
      />
    );
  }

  const members = (detail?.members ?? []).filter((m) => m.isActive && m.role !== 'viewer');
  const assignees = members.filter((m) => draft.assigneeIds.includes(m.id));
  const labels = (detail?.labels ?? []).filter((l) => draft.labelIds.includes(l.id));

  return (
    <form className="stack gap-4" onSubmit={submit} noValidate>
      {errors.form && (
        <p className="form-error" role="alert">
          {errors.form}
        </p>
      )}
      <Field label="Naslov" htmlFor="task-title" error={errors.title}>
        <Input
          id="task-title"
          data-autofocus
          value={draft.title}
          maxLength={200}
          invalid={Boolean(errors.title)}
          placeholder="Kaj je treba narediti?"
          onChange={(e) => set('title', e.target.value)}
        />
      </Field>
      <Field label="Opis" htmlFor="task-desc" optional>
        <Textarea
          id="task-desc"
          rows={4}
          maxLength={20000}
          value={draft.description}
          placeholder="Podrobnosti, zahteve, povezave …"
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>
      <div className="form-grid-2">
        <Field label="Projekt" htmlFor="task-project" error={errors.projectId}>
          <Select id="task-project" value={draft.projectId} onChange={(e) => changeProject(e.target.value)}>
            {writable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.key} · {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="task-column" error={errors.columnId}>
          <Select id="task-column" value={draft.columnId} disabled={!detail} onChange={(e) => set('columnId', e.target.value)}>
            {detail?.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prioriteta" htmlFor="task-priority">
          <Select id="task-priority" value={draft.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Odgovorni" optional>
          <Picker
            options={members.map((m) => ({
              value: m.id,
              label: fullName(m),
              render: (
                <span className="row gap-2 truncate">
                  <Avatar user={m} size={20} />
                  <span className="truncate">{fullName(m)}</span>
                  <span className="muted tabular">{m.openTasks} odprtih</span>
                </span>
              ),
            }))}
            value={draft.assigneeIds}
            onChange={(v) => set('assigneeIds', v)}
            placeholder="Poišči člana …"
            emptyText="V projektu ni aktivnih članov."
            width={300}
            trigger={(props) => (
              <button type="button" className="input input-button" disabled={!detail} {...props}>
                {assignees.length ? (
                  <span className="row gap-2 truncate">
                    <AvatarStack users={assignees} size={20} />
                    <span className="truncate">{assignees.map((a) => a.firstName).join(', ')}</span>
                  </span>
                ) : (
                  <span className="muted">Nedodeljeno</span>
                )}
              </button>
            )}
          />
        </Field>
        <Field label="Začetek" htmlFor="task-start" optional>
          <Input id="task-start" type="date" value={draft.startDate} max={draft.dueDate || undefined} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="Rok" htmlFor="task-due" optional error={errors.dueDate}>
          <Input id="task-due" type="date" value={draft.dueDate} min={draft.startDate || undefined} invalid={Boolean(errors.dueDate)} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
      </div>
      <Field label="Oznake" optional>
        <Picker
          options={(detail?.labels ?? []).map((l) => ({ value: l.id, label: l.name, color: l.color }))}
          value={draft.labelIds}
          onChange={(v) => set('labelIds', v)}
          placeholder="Poišči oznako …"
          emptyText="Projekt nima oznak. Dodate jih v nastavitvah projekta."
          trigger={(props) => (
            <button type="button" className="input input-button" disabled={!detail} {...props}>
              {labels.length ? (
                <span className="row gap-1 wrap">
                  {labels.map((l) => (
                    <LabelChip key={l.id} name={l.name} color={l.color} />
                  ))}
                </span>
              ) : (
                <span className="muted">Brez oznak</span>
              )}
            </button>
          )}
        />
      </Field>
      <div className="modal-actions">
        <Checkbox checked={another} onChange={setAnother} label="Ustvari še eno" />
        <span className="grow" />
        <Button variant="ghost" onClick={onClose}>
          Prekliči
        </Button>
        <Button variant="primary" type="submit" loading={create.isPending} disabled={!detail}>
          Ustvari nalogo
        </Button>
      </div>
    </form>
  );
}
