import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArchiveProject, useColumnMutations, useDeleteProject, useLabelMutations } from '../../api/hooks';
import { useFeedback } from '../../context/feedback';
import { Modal, Popover } from '../../components/overlays';
import { Button, EmptyState, Field, IconButton, Input, Select, SectionCard } from '../../components/ui';
import { plural } from '../../lib/format';
import { CATEGORIES, PALETTE } from '../../lib/meta';
import type { BoardColumn, ColumnCategory, Label } from '../../lib/types';
import { useProjectContext } from './ProjectLayout';

export default function ProjectSettingsTab() {
  const { project, canManage, isOwner } = useProjectContext();
  if (!canManage && !isOwner) {
    return (
      <div className="project-body">
        <EmptyState
          title={project.archivedAt ? 'Projekt je arhiviran' : 'Nimate dostopa do nastavitev'}
          description={project.archivedAt ? 'Nastavitve arhiviranega projekta ni mogoče spreminjati.' : 'Nastavitve projekta lahko urejajo vodje in lastnik projekta.'}
        />
      </div>
    );
  }
  return (
    <div className="project-body settings-stack">
      {canManage && <ColumnsSection />}
      {canManage && <LabelsSection />}
      {isOwner && <DangerZone />}
    </div>
  );
}

function ColorSwatch({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchor} type="button" className="swatch-button" style={{ background: value }} aria-label={label} title={label} onClick={() => setOpen((o) => !o)} />
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={196}>
        <div className="swatches swatches-pad" role="radiogroup" aria-label={label}>
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c.toLowerCase() === value.toLowerCase()}
              className="swatch"
              style={{ background: c }}
              aria-label={c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            />
          ))}
        </div>
      </Popover>
    </>
  );
}

function ColumnsSection() {
  const { project } = useProjectContext();
  const { create, update, reorder, remove } = useColumnMutations(project.id);
  const { success, error, confirm } = useFeedback();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ColumnCategory>('in_progress');
  const [deleting, setDeleting] = useState<BoardColumn | null>(null);
  const columns = project.columns;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), category, color: PALETTE[columns.length % PALETTE.length] });
      setName('');
      success('Stolpec dodan');
    } catch (err) {
      error(err, 'Stolpca ni bilo mogoče dodati');
    }
  };

  const patch = (id: string, data: { name?: string; category?: string; color?: string; wipLimit?: number | null }) =>
    update.mutate({ id, ...data }, { onError: (err) => error(err, 'Stolpca ni bilo mogoče posodobiti') });

  const move = (index: number, dir: -1 | 1) => {
    const ids = columns.map((c) => c.id);
    const target = index + dir;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids, { onError: (err) => error(err, 'Vrstnega reda ni bilo mogoče shraniti') });
  };

  const changeCategory = async (c: BoardColumn, next: ColumnCategory) => {
    if (c.taskCount && (next === 'done') !== (c.category === 'done')) {
      const ok = await confirm({
        title: 'Spremeni kategorijo stolpca',
        description:
          next === 'done'
            ? `${c.taskCount} ${plural(c.taskCount, ['naloga bo označena', 'nalogi bosta označeni', 'naloge bodo označene', 'nalog bo označenih'])} kot dokončane.`
            : `${c.taskCount} ${plural(c.taskCount, ['naloga ne bo', 'nalogi ne bosta', 'naloge ne bodo', 'nalog ne bo'])} več šteti kot dokončane.`,
        confirmLabel: 'Spremeni',
        tone: 'primary',
      });
      if (!ok) return;
    }
    patch(c.id, { category: next });
  };

  const askDelete = async (c: BoardColumn) => {
    if (c.taskCount > 0) {
      setDeleting(c);
      return;
    }
    const ok = await confirm({ title: `Izbriši stolpec »${c.name}«`, description: 'Stolpec je prazen in bo odstranjen s table.', confirmLabel: 'Izbriši stolpec' });
    if (ok) remove.mutate({ id: c.id }, { onSuccess: () => success('Stolpec izbrisan'), onError: (err) => error(err) });
  };

  return (
    <SectionCard title="Stolpci table" flush>
      <p className="card-intro">
        Stolpci so statusi nalog. Kategorija določa, ali naloga šteje kot odprta, v teku ali dokončana (vpliva na napredek, zamude in statistiko). Omejitev
        dela v teku (WIP) opozori, ko je v stolpcu preveč nalog.
      </p>
      <div className="settings-table" role="table" aria-label="Stolpci table">
        <div className="settings-row settings-head" role="row">
          <span role="columnheader">Ime</span>
          <span role="columnheader">Kategorija</span>
          <span role="columnheader">WIP</span>
          <span role="columnheader">Naloge</span>
          <span role="columnheader" className="sr-only">
            Dejanja
          </span>
        </div>
        {columns.map((c, i) => (
          <div key={c.id} className="settings-row" role="row">
            <span className="row gap-2" role="cell">
              <ColorSwatch value={c.color} label={`Barva stolpca ${c.name}`} onChange={(color) => patch(c.id, { color })} />
              <InlineText value={c.name} maxLength={40} label="Ime stolpca" onSave={(v) => patch(c.id, { name: v })} />
            </span>
            <span role="cell">
              <Select size_="sm" aria-label={`Kategorija stolpca ${c.name}`} value={c.category} onChange={(e) => changeCategory(c, e.target.value as ColumnCategory)}>
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </Select>
            </span>
            <span role="cell">
              <WipInput value={c.wipLimit} label={`Omejitev WIP za ${c.name}`} onSave={(wipLimit) => patch(c.id, { wipLimit })} />
            </span>
            <span role="cell" className="tabular secondary">
              {c.taskCount}
            </span>
            <span role="cell" className="row gap-1 settings-actions">
              <IconButton icon="arrowUp" size="sm" label={`Premakni ${c.name} levo`} disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} />
              <IconButton icon="arrowDown" size="sm" label={`Premakni ${c.name} desno`} disabled={i === columns.length - 1 || reorder.isPending} onClick={() => move(i, 1)} />
              <IconButton icon="trash" size="sm" label={`Izbriši stolpec ${c.name}`} disabled={columns.length <= 1} onClick={() => askDelete(c)} />
            </span>
          </div>
        ))}
      </div>
      {columns.length < 12 ? (
        <form className="settings-add" onSubmit={add}>
          <Input value={name} maxLength={40} placeholder="Ime novega stolpca, npr. Pregled" aria-label="Ime novega stolpca" onChange={(e) => setName(e.target.value)} />
          <Select aria-label="Kategorija novega stolpca" value={category} onChange={(e) => setCategory(e.target.value as ColumnCategory)}>
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </Select>
          <Button type="submit" icon="plus" loading={create.isPending} disabled={!name.trim()}>
            Dodaj stolpec
          </Button>
        </form>
      ) : (
        <p className="card-intro muted">Doseženo je največje število stolpcev (12).</p>
      )}
      <DeleteColumnModal column={deleting} columns={columns} onClose={() => setDeleting(null)} />
    </SectionCard>
  );
}

function DeleteColumnModal({ column, columns, onClose }: { column: BoardColumn | null; columns: BoardColumn[]; onClose: () => void }) {
  const { project } = useProjectContext();
  const { remove } = useColumnMutations(project.id);
  const { success, error } = useFeedback();
  const others = columns.filter((c) => c.id !== column?.id);
  const [target, setTarget] = useState('');
  useEffect(() => setTarget(others[0]?.id ?? ''), [column?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!column) return;
    try {
      await remove.mutateAsync({ id: column.id, moveTo: target });
      success('Stolpec izbrisan', `Naloge so premaknjene v »${others.find((c) => c.id === target)?.name}«.`);
      onClose();
    } catch (err) {
      error(err);
    }
  };

  return (
    <Modal
      open={Boolean(column)}
      onClose={onClose}
      size="sm"
      title={`Izbriši stolpec »${column?.name ?? ''}«`}
      description={column ? `Število nalog v stolpcu: ${column.taskCount}. Pred brisanjem jih premaknite v drug stolpec.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Prekliči
          </Button>
          <Button variant="danger" onClick={submit} loading={remove.isPending} disabled={!target}>
            Premakni in izbriši
          </Button>
        </>
      }
    >
      <Field label="Premakni naloge v" htmlFor="move-to">
        <Select id="move-to" value={target} onChange={(e) => setTarget(e.target.value)} data-autofocus>
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}

function InlineText({ value, onSave, label, maxLength }: { value: string; onSave: (v: string) => void; label: string; maxLength: number }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="input input-sm input-quiet"
      value={draft}
      maxLength={maxLength}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = draft.trim();
        if (!v) setDraft(value);
        else if (v !== value) onSave(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function WipInput({ value, onSave, label }: { value: number | null; onSave: (v: number | null) => void; label: string }) {
  const [draft, setDraft] = useState(value?.toString() ?? '');
  useEffect(() => setDraft(value?.toString() ?? ''), [value]);
  return (
    <input
      className="input input-sm wip-input"
      type="number"
      min={1}
      max={999}
      placeholder="—"
      value={draft}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = draft.trim() ? Math.round(Number(draft)) : null;
        if (n !== null && (!Number.isFinite(n) || n < 1)) {
          setDraft(value?.toString() ?? '');
          return;
        }
        if (n !== value) onSave(n);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function LabelsSection() {
  const { project } = useProjectContext();
  const { create, update, remove } = useLabelMutations(project.id);
  const { success, error, confirm } = useFeedback();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[project.labels.length % PALETTE.length]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), color });
      setName('');
      setColor(PALETTE[(project.labels.length + 1) % PALETTE.length]);
    } catch (err) {
      error(err, 'Oznake ni bilo mogoče dodati');
    }
  };

  const del = async (l: Label) => {
    const ok = await confirm({
      title: `Izbriši oznako »${l.name}«`,
      description: l.taskCount ? `Oznaka bo odstranjena z ${l.taskCount} ${plural(l.taskCount, ['naloge', 'nalog', 'nalog', 'nalog'])}. Naloge ostanejo nespremenjene.` : 'Oznaka ni uporabljena na nobeni nalogi.',
      confirmLabel: 'Izbriši oznako',
    });
    if (ok) remove.mutate(l.id, { onSuccess: () => success('Oznaka izbrisana'), onError: (err) => error(err) });
  };

  return (
    <SectionCard title={`Oznake · ${project.labels.length}`} flush>
      <p className="card-intro">Oznake pomagajo pri razvrščanju nalog po vrsti dela, področju ali stranki. Uporabite jih lahko v filtrih na tabli in seznamu.</p>
      {project.labels.length > 0 ? (
        <ul className="label-settings">
          {project.labels.map((l) => (
            <li key={l.id} className="label-settings-row">
              <ColorSwatch value={l.color} label={`Barva oznake ${l.name}`} onChange={(c) => update.mutate({ id: l.id, color: c }, { onError: (err) => error(err) })} />
              <InlineText value={l.name} maxLength={30} label="Ime oznake" onSave={(v) => update.mutate({ id: l.id, name: v }, { onError: (err) => error(err) })} />
              <span className="muted tabular">{l.taskCount ?? 0} {plural(l.taskCount ?? 0, ['naloga', 'nalogi', 'naloge', 'nalog'])}</span>
              <IconButton icon="trash" size="sm" label={`Izbriši oznako ${l.name}`} onClick={() => del(l)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="card-intro muted">Projekt še nima oznak.</p>
      )}
      <form className="settings-add" onSubmit={add}>
        <ColorSwatch value={color} onChange={setColor} label="Barva nove oznake" />
        <Input value={name} maxLength={30} placeholder="Ime nove oznake" aria-label="Ime nove oznake" onChange={(e) => setName(e.target.value)} />
        <Button type="submit" icon="plus" loading={create.isPending} disabled={!name.trim()}>
          Dodaj oznako
        </Button>
      </form>
    </SectionCard>
  );
}

function DangerZone() {
  const { project } = useProjectContext();
  const archive = useArchiveProject(project.id);
  const del = useDeleteProject();
  const navigate = useNavigate();
  const { success, error, confirm } = useFeedback();
  const archived = Boolean(project.archivedAt);

  const toggleArchive = async () => {
    if (!archived) {
      const ok = await confirm({
        title: 'Arhiviraj projekt',
        description: 'Projekt postane samo za branje: nalog ni mogoče ustvarjati, urejati ali premikati. Projekt lahko kadarkoli obnovite.',
        confirmLabel: 'Arhiviraj',
        tone: 'primary',
      });
      if (!ok) return;
    }
    try {
      await archive.mutateAsync(!archived);
      success(archived ? 'Projekt obnovljen' : 'Projekt arhiviran');
    } catch (err) {
      error(err);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Trajno izbriši projekt',
      description: (
        <>
          Izbrisani bodo projekt <strong>{project.name}</strong>, vse njegove naloge ({project.stats.total}), komentarji, oznake in zgodovina. Tega
          dejanja ni mogoče razveljaviti.
        </>
      ),
      confirmLabel: 'Trajno izbriši',
      typeToConfirm: project.key,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(project.id);
      success('Projekt izbrisan', project.name);
      navigate('/projects?archived=true', { replace: true });
    } catch (err) {
      error(err);
    }
  };

  return (
    <SectionCard title="Nevarno območje" className="danger-zone" flush>
      <div className="danger-row">
        <div>
          <strong>{archived ? 'Obnovi projekt' : 'Arhiviraj projekt'}</strong>
          <p className="secondary">
            {archived ? 'Projekt bo znova aktiven in ga bo mogoče urejati.' : 'Skrije projekt s seznama aktivnih projektov in ga zaklene za urejanje.'}
          </p>
        </div>
        <Button onClick={toggleArchive} loading={archive.isPending}>
          {archived ? 'Obnovi' : 'Arhiviraj'}
        </Button>
      </div>
      <div className="danger-row">
        <div>
          <strong>Trajno izbriši projekt</strong>
          <p className="secondary">{archived ? 'Izbriše projekt in vse podatke.' : 'Projekt je treba najprej arhivirati. Tako preprečimo nenamerno brisanje aktivnega dela.'}</p>
        </div>
        <Button variant="danger" onClick={remove} disabled={!archived} loading={del.isPending}>
          Izbriši
        </Button>
      </div>
    </SectionCard>
  );
}
