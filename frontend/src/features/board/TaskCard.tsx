import { memo, type CSSProperties, type KeyboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AvatarStack, cx, DueBadge, LabelChip, PriorityBadge } from '../../components/ui';
import type { Task } from '../../lib/types';

interface CardProps {
  task: Task;
  onOpen?: (id: string) => void;
  overlay?: boolean;
}

export function TaskCardBody({ task, overlay }: { task: Task; overlay?: boolean }) {
  const done = task.status.category === 'done';
  const labels = task.labels.slice(0, 3);
  const extraLabels = task.labels.length - labels.length;
  const checklistDone = task.checklist.total > 0 && task.checklist.done === task.checklist.total;
  return (
    <div className={cx('kcard', `kcard-${task.priority}`, done && 'is-done', task.isOverdue && 'is-overdue', overlay && 'is-overlay')}>
      <div className="kcard-top">
        <span className="kcard-key mono">{task.key}</span>
        <PriorityBadge priority={task.priority} compact />
      </div>
      <p className="kcard-title">{task.title}</p>
      {labels.length > 0 && (
        <div className="kcard-labels">
          {labels.map((l) => (
            <LabelChip key={l.id} name={l.name} color={l.color} />
          ))}
          {extraLabels > 0 && <span className="label-more">+{extraLabels}</span>}
        </div>
      )}
      <div className="kcard-foot">
        <div className="kcard-meta">
          <DueBadge date={task.dueDate} done={done} />
          {task.openBlockers > 0 && !done && (
            <span className="kcard-chip kcard-blocked" title="Odvisna od nedokončanih nalog">
              Blokirano
            </span>
          )}
          {task.checklist.total > 0 && (
            <span className={cx('kcard-chip', checklistDone && 'is-complete')} title="Podnaloge">
              <span className="kcard-check" aria-hidden="true" />
              <span className="tabular">
                {task.checklist.done}/{task.checklist.total}
              </span>
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="kcard-chip" title={`${task.commentCount} komentarjev`}>
              <span className="kcard-bubble" aria-hidden="true" />
              <span className="tabular">{task.commentCount}</span>
            </span>
          )}
        </div>
        <AvatarStack users={task.assignees} max={3} size={20} />
      </div>
    </div>
  );
}

export const SortableTaskCard = memo(function SortableTaskCard({ task, onOpen, disabled }: CardProps & { disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', columnId: task.columnId },
    disabled,
  });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !isDragging) {
      e.preventDefault();
      onOpen?.(task.id);
      return;
    }
    listeners?.onKeyDown?.(e);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cx('kcard-wrap', isDragging && 'is-placeholder')}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={() => onOpen?.(task.id)}
      aria-roledescription={disabled ? undefined : 'premična naloga'}
      aria-label={`${task.key}: ${task.title}. ${disabled ? 'Enter za odpiranje.' : 'Enter za odpiranje, preslednica za premik.'}`}
    >
      <TaskCardBody task={task} />
    </div>
  );
});
