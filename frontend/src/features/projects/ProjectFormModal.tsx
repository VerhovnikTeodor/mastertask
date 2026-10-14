import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateProject, useTeam, useUpdateProject, type ProjectInput } from '../../api/hooks';
import { useFeedback } from '../../context/feedback';
import { useCurrentUser } from '../../context/auth';
import { Modal, Picker } from '../../components/overlays';
import { Avatar, AvatarStack, Button, cx, Field, Input, Select, Textarea } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ApiError } from '../../lib/api';
import { fullName } from '../../lib/format';
import { PALETTE, PRIORITIES, PROJECT_STATUSES } from '../../lib/meta';
import type { ProjectDetail } from '../../lib/types';

function suggestKey(name: string) {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  const key = words.length >= 2 ? words.slice(0, 4).map((w) => w[0]).join('') : words[0].slice(0, 4);
  return /^[A-Z]/.test(key) ? key.padEnd(2, 'X') : `P${key}`.slice(0, 4);
}

export function ProjectFormModal({ open, onClose, project }: { open: boolean; onClose: () => void; project?: ProjectDetail }) {
  if (!open) return null;
  return <ProjectForm onClose={onClose} project={project} />;
}

function ProjectForm({ onClose, project }: { onClose: () => void; project?: ProjectDetail }) {
  const editing = Boolean(project);
  const me = useCurrentUser();
  const navigate = useNavigate();
  const { success, error } = useFeedback();
  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? '');
  const team = useTeam();
  const [form, setForm] = useState<ProjectInput & { keyTouched?: boolean }>({
    name: project?.name ?? '',
    key: project?.key ?? '',
    description: project?.description ?? '',
    status: project?.status ?? 'active',
    priority: project?.priority ?? 'medium',
    color: project?.color ?? PALETTE[0],
    startDate: project?.startDate ?? '',
    dueDate: project?.dueDate ?? '',
    memberIds: [],
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const saving = create.isPending || update.isPending;
  const others = (team.data ?? []).filter((u) => u.id !== me.id && u.isActive);
  const selectedMembers = others.filter((u) => form.memberIds?.includes(u.id));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFields({});
    if (!form.name?.trim()) {
      setFields({ name: 'Ime projekta je obvezno.' });
      return;
    }
    const payload: ProjectInput = {
      name: form.name,
      description: form.description,
      status: form.status,
      priority: form.priority,
      color: form.color,
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
    };
    try {
      if (editing) {
        await update.mutateAsync(payload);
        success('Projekt posodobljen');
        onClose();
      } else {
        const { project: created } = await create.mutateAsync({
          ...payload,
          key: form.key || undefined,
          memberIds: form.memberIds,
        });
        success('Projekt ustvarjen', `${created.name} (${created.key}) je pripravljen z osnovno Kanban tablo.`);
        onClose();
        navigate(`/projects/${created.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      else error(err, editing ? 'Projekta ni bilo mogoče posodobiti' : 'Projekta ni bilo mogoče ustvariti');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Uredi projekt' : 'Nov projekt'}
      description={editing ? undefined : 'Projekt dobi Kanban tablo s štirimi stolpci in osnovnimi oznakami, ki jih lahko kasneje prilagodite.'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Prekliči
          </Button>
          <Button variant="primary" type="submit" form="project-form" loading={saving}>
            {editing ? 'Shrani spremembe' : 'Ustvari projekt'}
          </Button>
        </>
      }
    >
      <form id="project-form" className="form" onSubmit={submit} noValidate>
        <div className="form-grid-name">
          <Field label="Ime projekta" htmlFor="p-name" error={fields.name}>
            <Input
              id="p-name"
              data-autofocus
              value={form.name}
              maxLength={120}
              placeholder="npr. Prenova spletne strani"
              invalid={Boolean(fields.name)}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name, key: editing || f.keyTouched ? f.key : suggestKey(name) }));
              }}
            />
          </Field>
          <Field label="Oznaka" htmlFor="p-key" error={fields.key} hint={editing ? 'Oznake ni mogoče spremeniti.' : 'Predpona nalog, npr. WEB-12'}>
            <Input
              id="p-key"
              className="mono"
              value={form.key}
              maxLength={6}
              disabled={editing}
              invalid={Boolean(fields.key)}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), keyTouched: true }))}
            />
          </Field>
        </div>
        <Field label="Opis" htmlFor="p-desc" optional error={fields.description}>
          <Textarea id="p-desc" rows={3} maxLength={5000} value={form.description} placeholder="Cilji, obseg in pomembne informacije" onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="form-grid-2">
          <Field label="Status" htmlFor="p-status">
            <Select id="p-status" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioriteta" htmlFor="p-priority">
            <Select id="p-priority" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Začetek" htmlFor="p-start" optional error={fields.startDate}>
            <Input id="p-start" type="date" value={form.startDate ?? ''} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Rok" htmlFor="p-due" optional error={fields.dueDate}>
            <Input id="p-due" type="date" value={form.dueDate ?? ''} min={form.startDate || undefined} onChange={(e) => set('dueDate', e.target.value)} invalid={Boolean(fields.dueDate)} />
          </Field>
        </div>
        <Field label="Barva">
          <div className="swatches" role="radiogroup" aria-label="Barva projekta">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={form.color === c}
                aria-label={c}
                className={cx('swatch', form.color === c && 'is-selected')}
                style={{ background: c }}
                onClick={() => set('color', c)}
              >
                {form.color === c && <Icon name="check" size={13} />}
              </button>
            ))}
          </div>
        </Field>
        {!editing && (
          <Field label="Člani ekipe" optional hint="Dodani bodo z vlogo »Član«. Vloge lahko spremenite kasneje." error={fields.memberIds}>
            <Picker
              options={others.map((u) => ({
                value: u.id,
                label: fullName(u),
                render: (
                  <span className="row gap-2 truncate">
                    <Avatar user={u} size={20} />
                    <span className="truncate">{fullName(u)}</span>
                    <span className="muted truncate">{u.jobTitle}</span>
                  </span>
                ),
              }))}
              value={form.memberIds ?? []}
              onChange={(v) => set('memberIds', v)}
              placeholder="Poišči sodelavca …"
              emptyText="Ni drugih uporabnikov."
              width={320}
              trigger={(props) => (
                <button type="button" className="input input-button" {...props}>
                  {selectedMembers.length ? (
                    <span className="row gap-2">
                      <AvatarStack users={selectedMembers} max={5} size={20} />
                      <span>
                        {selectedMembers.length} {selectedMembers.length === 1 ? 'član' : 'članov'}
                      </span>
                    </span>
                  ) : (
                    <span className="muted">Izberite člane</span>
                  )}
                  <Icon name="chevronDown" size={14} />
                </button>
              )}
            />
          </Field>
        )}
      </form>
    </Modal>
  );
}
