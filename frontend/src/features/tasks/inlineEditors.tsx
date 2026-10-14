import { useRef, useState } from 'react';
import { useProject, useUpdateTask } from '../../api/hooks';
import { useFeedback } from '../../context/feedback';
import { Picker } from '../../components/overlays';
import { cx, PriorityBadge, Spinner, StatusBadge } from '../../components/ui';
import { dueInfo } from '../../lib/format';
import { PRIORITIES } from '../../lib/meta';
import type { Priority, Task } from '../../lib/types';

/** Status naloge = stolpec projekta; stolpci se naložijo šele ob odprtju izbirnika. */
export function StatusEditor({ task, disabled }: { task: Task; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const project = useProject(open ? task.projectId : undefined);
  const update = useUpdateTask();
  const { error } = useFeedback();
  const options = (project.data?.columns ?? []).map((c) => ({ value: c.id, label: c.name, color: c.color }));

  if (disabled) return <StatusBadge status={task.status} />;
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Picker
        multiple={false}
        options={options}
        value={[task.columnId]}
        emptyText={project.isPending ? 'Nalagam stolpce …' : 'Ni stolpcev.'}
        placeholder="Spremeni status"
        width={220}
        onChange={(v) => {
          if (!v[0] || v[0] === task.columnId) return;
          update.mutate({ id: task.id, columnId: v[0] }, { onError: (err) => error(err, 'Statusa ni bilo mogoče spremeniti') });
        }}
        trigger={({ onClick, ...props }) => (
          <button
            type="button"
            className="inline-edit"
            aria-label={`Status: ${task.status.name}. Spremeni`}
            {...props}
            onClick={() => {
              setOpen(true);
              onClick();
            }}
          >
            <StatusBadge status={task.status} />
            {update.isPending && <Spinner size={12} />}
          </button>
        )}
      />
    </span>
  );
}

export function PriorityEditor({ task, disabled }: { task: Task; disabled?: boolean }) {
  const update = useUpdateTask();
  const { error } = useFeedback();
  if (disabled) return <PriorityBadge priority={task.priority} />;
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Picker
        multiple={false}
        options={PRIORITIES.map((p) => ({ value: p.value, label: p.label, render: <PriorityBadge priority={p.value} /> }))}
        value={[task.priority]}
        placeholder="Prioriteta"
        width={200}
        onChange={(v) => {
          if (!v[0] || v[0] === task.priority) return;
          update.mutate({ id: task.id, priority: v[0] as Priority }, { onError: (err) => error(err, 'Prioritete ni bilo mogoče spremeniti') });
        }}
        trigger={(props) => (
          <button type="button" className="inline-edit" aria-label="Spremeni prioriteto" {...props}>
            <PriorityBadge priority={task.priority} />
          </button>
        )}
      />
    </span>
  );
}

export function DueEditor({ task, disabled }: { task: Task; disabled?: boolean }) {
  const update = useUpdateTask();
  const { error } = useFeedback();
  const ref = useRef<HTMLInputElement>(null);
  const info = dueInfo(task.dueDate, task.status.category === 'done');
  const label = info?.label ?? 'Brez roka';

  if (disabled) return <span className={cx('due', info ? `due-${info.tone}` : 'due-empty')}>{label}</span>;
  return (
    <label className="inline-edit inline-date" onClick={(e) => e.stopPropagation()}>
      <span className={cx('due', info ? `due-${info.tone}` : 'due-empty')}>{label}</span>
      <input
        ref={ref}
        type="date"
        value={task.dueDate ?? ''}
        aria-label={`Rok naloge ${task.key}`}
        onChange={(e) =>
          update.mutate({ id: task.id, dueDate: e.target.value || null }, { onError: (err) => error(err, 'Roka ni bilo mogoče spremeniti') })
        }
      />
    </label>
  );
}
