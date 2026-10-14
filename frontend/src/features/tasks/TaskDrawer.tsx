import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useIsMutating } from '@tanstack/react-query';
import {
  useBoard,
  useChecklist,
  useCommentMutations,
  useComments,
  useDependencies,
  useLabelMutations,
  useProject,
  useTask,
  useTaskAction,
  useTaskActivity,
  useUpdateTask,
  type TaskInput,
} from '../../api/hooks';
import { useCurrentUser } from '../../context/auth';
import { useFeedback } from '../../context/feedback';
import { useTaskDrawer } from '../../layout/workspace';
import { Drawer, Menu, Picker } from '../../components/overlays';
import { ActivityFeed } from '../../components/common';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  cx,
  EmptyState,
  IconButton,
  LabelChip,
  PageLoader,
  PriorityBadge,
  ProgressBar,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { daysFromToday, formatDate, formatDateTime, fullName, pluralDays, timeAgo } from '../../lib/format';
import { PALETTE, PRIORITIES, hasRole } from '../../lib/meta';
import type { Comment, Priority, ProjectDetail, TaskDetail, TaskPermissions } from '../../lib/types';

export function TaskDrawerHost() {
  const { taskId, closeTask } = useTaskDrawer();
  return (
    <Drawer open={Boolean(taskId)} onClose={closeTask} label="Podrobnosti naloge" width={680}>
      {taskId && <TaskPanel key={taskId} taskId={taskId} onClose={closeTask} />}
    </Drawer>
  );
}

function TaskPanel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { data, isPending, error, refetch } = useTask(taskId);
  const project = useProject(data?.task.projectId);

  if (isPending) return <PageLoader label="Nalagam nalogo …" />;
  if (error) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <div className="drawer-state">
        <EmptyState
          title={missing ? 'Naloga ne obstaja' : 'Naloge ni bilo mogoče naložiti'}
          description={missing ? 'Naloga je bila izbrisana ali pa do nje nimate več dostopa.' : errorMessage(error)}
          action={
            <div className="row gap-2">
              {!missing && <Button onClick={() => refetch()}>Poskusi znova</Button>}
              <Button variant="ghost" onClick={onClose}>
                Zapri
              </Button>
            </div>
          }
        />
      </div>
    );
  }
  return <TaskPanelContent task={data.task} permissions={data.permissions} project={project.data} onClose={onClose} />;
}

function TaskPanelContent({
  task,
  permissions,
  project,
  onClose,
}: {
  task: TaskDetail;
  permissions: TaskPermissions;
  project?: ProjectDetail;
  onClose: () => void;
}) {
  const update = useUpdateTask();
  const action = useTaskAction();
  const { success, error, confirm, toast } = useFeedback();
  const saving = useIsMutating() > 0;
  const editable = permissions.canEdit;
  const done = task.status.category === 'done';
  const memberIds = new Set(project?.members.map((m) => m.id));

  const save = (patch: Omit<TaskInput, 'projectId'>, label?: string) =>
    update.mutate(
      { id: task.id, ...patch },
      { onError: (err) => error(err, label ? `${label} ni bilo mogoče shraniti` : 'Sprememba ni bila shranjena') },
    );

  const runAction = async (kind: 'archive' | 'restore' | 'delete') => {
    if (kind === 'delete') {
      const ok = await confirm({
        title: 'Trajno izbriši nalogo',
        description: (
          <>
            Naloga <strong>{task.key}</strong> bo skupaj s komentarji in podnalogami trajno izbrisana. Tega dejanja ni mogoče razveljaviti.
            Če jo želite le umakniti s table, jo raje arhivirajte.
          </>
        ),
        confirmLabel: 'Izbriši nalogo',
      });
      if (!ok) return;
    }
    try {
      await action.mutateAsync({ id: task.id, projectId: task.projectId, action: kind });
      if (kind === 'delete') {
        success('Naloga izbrisana', `${task.key} je bila trajno izbrisana.`);
        onClose();
      } else if (kind === 'archive') {
        toast({
          tone: 'success',
          title: 'Naloga arhivirana',
          description: `${task.key} je umaknjena s table.`,
          action: { label: 'Razveljavi', onClick: () => action.mutate({ id: task.id, projectId: task.projectId, action: 'restore' }) },
        });
      } else {
        success('Naloga obnovljena');
      }
    } catch (err) {
      error(err);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tasks?task=${task.id}`);
      success('Povezava kopirana');
    } catch {
      error(new Error('Brskalnik ne dovoli dostopa do odložišča.'));
    }
  };

  const overdueDays = task.isOverdue && task.dueDate ? Math.abs(daysFromToday(task.dueDate)) : 0;

  return (
    <div className="task-panel">
      <header className="task-panel-head">
        <Link to={`/projects/${task.projectId}`} className="task-panel-project" onClick={onClose}>
          <span className="project-dot" style={{ background: task.project.color }} />
          <span className="truncate">{task.project.name}</span>
        </Link>
        <span className="mono muted">{task.key}</span>
        <span className="grow" />
        {saving && (
          <span className="saving-indicator">
            <Spinner size={12} /> Shranjujem
          </span>
        )}
        <IconButton icon="link" label="Kopiraj povezavo" onClick={copyLink} />
        {(permissions.canArchive || permissions.canDelete) && (
          <Menu
            trigger={(props) => <IconButton icon="more" label="Več dejanj" {...props} />}
            items={[
              ...(permissions.canArchive
                ? [task.archivedAt ? { label: 'Obnovi iz arhiva', onSelect: () => runAction('restore') } : { label: 'Arhiviraj', onSelect: () => runAction('archive') }]
                : []),
              ...(permissions.canDelete ? ['divider' as const, { label: 'Trajno izbriši', tone: 'danger' as const, onSelect: () => runAction('delete') }] : []),
            ]}
          />
        )}
        <IconButton icon="x" label="Zapri" onClick={onClose} data-autofocus />
      </header>

      <div className="task-panel-scroll">
        {task.archivedAt && (
          <div className="banner banner-neutral">
            <span>Naloga je arhivirana {formatDate(task.archivedAt)} in je samo za branje.</span>
            {permissions.canArchive && (
              <Button size="sm" onClick={() => runAction('restore')}>
                Obnovi
              </Button>
            )}
          </div>
        )}
        {task.isOverdue && (
          <div className="banner banner-danger">
            <span>
              Rok je potekel pred {overdueDays} {pluralDays(overdueDays)} ({formatDate(task.dueDate)}).
            </span>
          </div>
        )}
        {task.openBlockers > 0 && !done && (
          <div className="banner banner-warning">
            <span>Naloga je blokirana: čaka na {task.openBlockers} nedokončane odvisne naloge.</span>
          </div>
        )}

        <TitleEditor value={task.title} editable={editable} onSave={(title) => save({ title }, 'Naslova')} />

        <dl className="props">
          <Prop label="Status">
            {editable && project ? (
              <Select size_="sm" value={task.columnId} aria-label="Status" onChange={(e) => save({ columnId: e.target.value }, 'Statusa')}>
                {project.columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            ) : (
              <StatusBadge status={task.status} />
            )}
          </Prop>
          <Prop label="Prioriteta">
            {editable ? (
              <Select size_="sm" value={task.priority} aria-label="Prioriteta" onChange={(e) => save({ priority: e.target.value as Priority }, 'Prioritete')}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            ) : (
              <PriorityBadge priority={task.priority} />
            )}
          </Prop>
          <Prop label="Odgovorni">
            <AssigneeEditor task={task} project={project} editable={editable} memberIds={memberIds} onSave={(assigneeIds) => save({ assigneeIds }, 'Odgovornih oseb')} />
          </Prop>
          <Prop label="Rok">
            <DateField value={task.dueDate} min={task.startDate} editable={editable} tone={task.isOverdue ? 'danger' : undefined} onSave={(dueDate) => save({ dueDate }, 'Roka')} label="Rok" />
          </Prop>
          <Prop label="Začetek">
            <DateField value={task.startDate} max={task.dueDate} editable={editable} onSave={(startDate) => save({ startDate }, 'Začetka')} label="Začetek" />
          </Prop>
          <Prop label="Oznake">
            <LabelEditor task={task} project={project} editable={editable} onSave={(labelIds) => save({ labelIds }, 'Oznak')} />
          </Prop>
          <Prop label="Ustvarjeno">
            <span className="secondary">
              {formatDateTime(task.createdAt)}
              {task.createdBy && <> · {fullName(task.createdBy)}</>}
            </span>
          </Prop>
          {task.completedAt && (
            <Prop label="Dokončano">
              <span className="text-success">{formatDateTime(task.completedAt)}</span>
            </Prop>
          )}
        </dl>

        <Section title="Opis">
          <DescriptionEditor value={task.description} editable={editable} onSave={(description) => save({ description }, 'Opisa')} />
        </Section>

        <ChecklistSection task={task} editable={editable} />
        <DependencySection task={task} editable={editable} />

        <ActivityTabs task={task} permissions={permissions} project={project} />
      </div>
    </div>
  );
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="prop">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Section({ title, children, action, meta }: { title: string; children: ReactNode; action?: ReactNode; meta?: ReactNode }) {
  return (
    <section className="panel-section">
      <header className="panel-section-head">
        <h3>{title}</h3>
        {meta}
        <span className="grow" />
        {action}
      </header>
      {children}
    </section>
  );
}

function TitleEditor({ value, editable, onSave }: { value: string; editable: boolean; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const v = draft.trim();
    if (!v) setDraft(value);
    else if (v !== value) onSave(v);
  };
  if (!editable) return <h2 className="task-panel-title">{value}</h2>;
  return (
    <textarea
      className="task-panel-title title-input"
      value={draft}
      rows={1}
      maxLength={200}
      aria-label="Naslov naloge"
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          setDraft(value);
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      ref={(el) => {
        if (el) {
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
        }
      }}
    />
  );
}

function DateField({
  value,
  editable,
  onSave,
  min,
  max,
  tone,
  label,
}: {
  value: string | null;
  editable: boolean;
  onSave: (v: string | null) => void;
  min?: string | null;
  max?: string | null;
  tone?: 'danger';
  label: string;
}) {
  if (!editable) return <span className={cx(tone === 'danger' && 'text-danger', !value && 'muted')}>{value ? formatDate(value, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Ni določen'}</span>;
  return (
    <span className="row gap-1">
      <input
        type="date"
        className={cx('input input-sm date-input', tone === 'danger' && 'is-danger')}
        value={value ?? ''}
        min={min ?? undefined}
        max={max ?? undefined}
        aria-label={label}
        onChange={(e) => onSave(e.target.value || null)}
      />
      {value && <IconButton icon="x" size="sm" label={`Odstrani ${label.toLowerCase()}`} onClick={() => onSave(null)} />}
    </span>
  );
}

function AssigneeEditor({
  task,
  project,
  editable,
  memberIds,
  onSave,
}: {
  task: TaskDetail;
  project?: ProjectDetail;
  editable: boolean;
  memberIds: Set<string>;
  onSave: (ids: string[]) => void;
}) {
  const people = (
    <div className="assignee-list">
      {task.assignees.length === 0 && <span className="muted">Nedodeljeno</span>}
      {task.assignees.map((a) => (
        <span key={a.id} className="assignee-chip">
          <Avatar user={a} size={20} />
          <span className="truncate">{fullName(a)}</span>
          {project && !memberIds.has(a.id) && <span className="muted">(ni več član)</span>}
          {!a.isActive && <span className="muted">(neaktiven)</span>}
        </span>
      ))}
    </div>
  );
  if (!editable || !project) return people;
  const activeMembers = project.members.filter((m) => m.isActive && m.role !== 'viewer');
  return (
    <Picker
      options={activeMembers.map((m) => ({
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
      value={task.assignees.map((a) => a.id)}
      onChange={onSave}
      placeholder="Dodeli člana …"
      width={300}
      trigger={(props) => (
        <button type="button" className="prop-button" {...props}>
          {people}
        </button>
      )}
    />
  );
}

function LabelEditor({ task, project, editable, onSave }: { task: TaskDetail; project?: ProjectDetail; editable: boolean; onSave: (ids: string[]) => void }) {
  const labels = useLabelMutations(task.projectId);
  const { error } = useFeedback();
  const [newName, setNewName] = useState('');
  const chips = (
    <span className="row gap-1 wrap">
      {task.labels.length === 0 && <span className="muted">Brez oznak</span>}
      {task.labels.map((l) => (
        <LabelChip key={l.id} name={l.name} color={l.color} />
      ))}
    </span>
  );
  if (!editable || !project) return chips;

  const createLabel = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const { label } = await labels.create.mutateAsync({ name, color: PALETTE[project.labels.length % PALETTE.length] });
      onSave([...task.labels.map((l) => l.id), label.id]);
      setNewName('');
    } catch (err) {
      error(err, 'Oznake ni bilo mogoče ustvariti');
    }
  };

  return (
    <Picker
      options={project.labels.map((l) => ({ value: l.id, label: l.name, color: l.color }))}
      value={task.labels.map((l) => l.id)}
      onChange={onSave}
      placeholder="Poišči oznako …"
      emptyText="Ni oznak s tem imenom."
      footer={
        <form
          className="row gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            createLabel();
          }}
        >
          <input className="input input-sm grow" value={newName} maxLength={30} placeholder="Nova oznaka" aria-label="Ime nove oznake" onChange={(e) => setNewName(e.target.value)} />
          <Button size="sm" type="submit" loading={labels.create.isPending} disabled={!newName.trim()}>
            Dodaj
          </Button>
        </form>
      }
      trigger={(props) => (
        <button type="button" className="prop-button" {...props}>
          {chips}
        </button>
      )}
    />
  );
}

function DescriptionEditor({ value, editable, onSave }: { value: string; editable: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (editing) {
    return (
      <div className="stack gap-2">
        <Textarea
          autoFocus
          rows={8}
          maxLength={20000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Opišite cilj naloge, zahteve in merila sprejemljivosti …"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setEditing(false);
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              onSave(draft);
              setEditing(false);
            }
          }}
        />
        <div className="row gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              if (draft !== value) onSave(draft);
              setEditing(false);
            }}
          >
            Shrani
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Prekliči
          </Button>
          <span className="muted hint-inline">⌘/Ctrl + Enter za shranjevanje</span>
        </div>
      </div>
    );
  }
  if (!value) {
    return editable ? (
      <button type="button" className="description-empty" onClick={() => setEditing(true)}>
        Dodajte opis …
      </button>
    ) : (
      <p className="muted">Brez opisa.</p>
    );
  }
  return (
    <div className={cx('description', editable && 'is-editable')} onClick={() => editable && setEditing(true)} role={editable ? 'button' : undefined} tabIndex={editable ? 0 : undefined} onKeyDown={(e) => editable && e.key === 'Enter' && setEditing(true)} aria-label={editable ? 'Uredi opis' : undefined}>
      {value}
    </div>
  );
}

function ChecklistSection({ task, editable }: { task: TaskDetail; editable: boolean }) {
  const { add, update, remove } = useChecklist(task.id, task.projectId);
  const { error } = useFeedback();
  const [draft, setDraft] = useState('');
  const items = task.checklistItems;
  const doneCount = items.filter((i) => i.isDone).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const content = draft.trim();
    if (!content) return;
    try {
      await add.mutateAsync(content);
      setDraft('');
      inputRef.current?.focus();
    } catch (err) {
      error(err, 'Podnaloge ni bilo mogoče dodati');
    }
  };

  if (!editable && items.length === 0) return null;
  return (
    <Section title="Podnaloge" meta={items.length > 0 && <span className="muted tabular">{doneCount}/{items.length}</span>}>
      {items.length > 0 && <ProgressBar value={pct} size="sm" tone={pct === 100 ? 'success' : 'accent'} label="Napredek podnalog" />}
      <ul className="checklist">
        {items.map((item) => (
          <li key={item.id} className={cx('checklist-item', item.isDone && 'is-done')}>
            <Checkbox
              checked={item.isDone}
              disabled={!editable}
              onChange={(isDone) => update.mutate({ id: item.id, isDone }, { onError: (err) => error(err) })}
              label={item.content}
            />
            {editable && (
              <IconButton icon="x" size="sm" label={`Odstrani podnalogo ${item.content}`} className="checklist-remove" onClick={() => remove.mutate(item.id, { onError: (err) => error(err) })} />
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form
          className="checklist-add"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input ref={inputRef} className="input input-sm" value={draft} maxLength={300} placeholder="Dodaj podnalogo …" aria-label="Nova podnaloga" onChange={(e) => setDraft(e.target.value)} />
          <Button size="sm" type="submit" loading={add.isPending} disabled={!draft.trim()}>
            Dodaj
          </Button>
        </form>
      )}
    </Section>
  );
}

function DependencySection({ task, editable }: { task: TaskDetail; editable: boolean }) {
  const deps = useDependencies(task.id, task.projectId);
  const board = useBoard(task.projectId);
  const { error } = useFeedback();
  const { openTask } = useTaskDrawer();
  const excluded = new Set([task.id, ...task.blockedBy.map((b) => b.id)]);
  const candidates = (board.data ?? []).filter((t) => !excluded.has(t.id));

  if (!editable && task.blockedBy.length === 0 && task.blocking.length === 0) return null;
  const renderRef = (r: TaskDetail['blockedBy'][number], removable: boolean) => (
    <li key={r.id} className={cx('dep-item', r.status.category === 'done' && 'is-done')}>
      <button type="button" className="dep-link" onClick={() => openTask(r.id)}>
        <span className="mono muted">{r.key}</span>
        <span className="truncate">{r.title}</span>
      </button>
      <StatusBadge status={r.status} />
      {removable && editable && (
        <IconButton icon="x" size="sm" label={`Odstrani odvisnost ${r.key}`} onClick={() => deps.remove.mutate(r.id, { onError: (err) => error(err) })} />
      )}
    </li>
  );

  return (
    <Section
      title="Odvisnosti"
      action={
        editable && (
          <Picker
            multiple={false}
            options={candidates.map((t) => ({ value: t.id, label: `${t.key} ${t.title}`, render: <span className="row gap-2 truncate"><span className="mono muted">{t.key}</span><span className="truncate">{t.title}</span></span> }))}
            value={[]}
            onChange={(v) => v[0] && deps.add.mutate(v[0], { onError: (err) => error(err, 'Odvisnosti ni bilo mogoče dodati') })}
            placeholder="Poišči nalogo v projektu …"
            emptyText="Ni drugih nalog."
            align="end"
            width={340}
            trigger={(props) => (
              <Button size="sm" variant="ghost" icon="plus" {...props}>
                Blokira jo
              </Button>
            )}
          />
        )
      }
    >
      {task.blockedBy.length === 0 && task.blocking.length === 0 && <p className="muted">Naloga nima odvisnosti.</p>}
      {task.blockedBy.length > 0 && (
        <>
          <p className="dep-caption">Čaka na</p>
          <ul className="dep-list">{task.blockedBy.map((r) => renderRef(r, true))}</ul>
        </>
      )}
      {task.blocking.length > 0 && (
        <>
          <p className="dep-caption">Blokira</p>
          <ul className="dep-list">{task.blocking.map((r) => renderRef(r, false))}</ul>
        </>
      )}
    </Section>
  );
}

function ActivityTabs({ task, permissions, project }: { task: TaskDetail; permissions: TaskPermissions; project?: ProjectDetail }) {
  const [tab, setTab] = useState<'comments' | 'history'>('comments');
  return (
    <section className="panel-section">
      <div className="tabs-inline" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'comments'} className={cx('tab-inline', tab === 'comments' && 'is-active')} onClick={() => setTab('comments')}>
          Komentarji {task.commentCount > 0 && <span className="tab-count">{task.commentCount}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'history'} className={cx('tab-inline', tab === 'history' && 'is-active')} onClick={() => setTab('history')}>
          Zgodovina
        </button>
      </div>
      {tab === 'comments' ? <CommentsPanel task={task} permissions={permissions} project={project} /> : <HistoryPanel taskId={task.id} />}
    </section>
  );
}

function HistoryPanel({ taskId }: { taskId: string }) {
  const { data, isPending } = useTaskActivity(taskId);
  if (isPending) return <PageLoader />;
  if (!data?.length) return <p className="muted">Ni zabeleženih sprememb.</p>;
  return <ActivityFeed items={data} showProject={false} showTask={false} />;
}

function CommentsPanel({ task, permissions, project }: { task: TaskDetail; permissions: TaskPermissions; project?: ProjectDetail }) {
  const me = useCurrentUser();
  const comments = useComments(task.id);
  const { add } = useCommentMutations(task.id, task.projectId);
  const { error } = useFeedback();
  const [draft, setDraft] = useState('');
  const canModerate = hasRole(project?.myRole, 'manager');

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      await add.mutateAsync(body);
      setDraft('');
    } catch (err) {
      error(err, 'Komentarja ni bilo mogoče objaviti');
    }
  };

  return (
    <div className="comments">
      {comments.isPending ? (
        <PageLoader />
      ) : comments.data?.length ? (
        <ol className="comment-list">
          {comments.data.map((c) => (
            <CommentItem key={c.id} comment={c} taskId={task.id} projectId={task.projectId} canEdit={c.author.id === me.id && permissions.canComment} canDelete={(c.author.id === me.id || canModerate) && permissions.canComment} />
          ))}
        </ol>
      ) : (
        <p className="muted">Še ni komentarjev. Začnite razpravo.</p>
      )}
      {permissions.canComment && (
        <div className="comment-composer">
          <Avatar user={me} size={28} />
          <div className="grow stack gap-2">
            <Textarea
              rows={draft ? 3 : 2}
              maxLength={5000}
              value={draft}
              placeholder="Napišite komentar …"
              aria-label="Nov komentar"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {draft.trim() && (
              <div className="row gap-2">
                <Button size="sm" variant="primary" onClick={submit} loading={add.isPending}>
                  Objavi
                </Button>
                <span className="muted hint-inline">⌘/Ctrl + Enter</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CommentItem({ comment, taskId, projectId, canEdit, canDelete }: { comment: Comment; taskId: string; projectId: string; canEdit: boolean; canDelete: boolean }) {
  const { update, remove } = useCommentMutations(taskId, projectId);
  const { error, confirm } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);

  const del = async () => {
    if (!(await confirm({ title: 'Izbriši komentar', description: 'Komentar bo trajno izbrisan.', confirmLabel: 'Izbriši' }))) return;
    remove.mutate(comment.id, { onError: (err) => error(err) });
  };

  return (
    <li className="comment">
      <Avatar user={comment.author} size={28} />
      <div className="comment-main">
        <div className="comment-head">
          <strong>{fullName(comment.author)}</strong>
          {!comment.author.isActive && <Badge>neaktiven</Badge>}
          <time className="muted" dateTime={comment.createdAt} title={formatDateTime(comment.createdAt)}>
            {timeAgo(comment.createdAt)}
          </time>
          {comment.editedAt && <span className="muted">· urejeno</span>}
          <span className="grow" />
          {!editing && (canEdit || canDelete) && (
            <Menu
              trigger={(props) => <IconButton icon="more" size="sm" label="Dejanja komentarja" {...props} />}
              items={[
                ...(canEdit ? [{ label: 'Uredi', onSelect: () => setEditing(true) }] : []),
                ...(canDelete ? [{ label: 'Izbriši', tone: 'danger' as const, onSelect: del }] : []),
              ]}
            />
          )}
        </div>
        {editing ? (
          <div className="stack gap-2">
            <Textarea rows={3} autoFocus value={draft} maxLength={5000} onChange={(e) => setDraft(e.target.value)} />
            <div className="row gap-2">
              <Button
                size="sm"
                variant="primary"
                loading={update.isPending}
                disabled={!draft.trim()}
                onClick={() =>
                  update.mutate(
                    { id: comment.id, body: draft.trim() },
                    { onSuccess: () => setEditing(false), onError: (err) => error(err) },
                  )
                }
              >
                Shrani
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(comment.body); }}>
                Prekliči
              </Button>
            </div>
          </div>
        ) : (
          <p className="comment-body">{comment.body}</p>
        )}
      </div>
    </li>
  );
}
