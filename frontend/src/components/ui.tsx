import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import { dueInfo, fullName, initials } from '../lib/format';
import { PRIORITY_LABEL } from '../lib/meta';
import type { Priority, TaskStatusRef, UserBrief } from '../lib/types';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');
export { cx };

// Gumbi ---------------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', loading && 'is-loading', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 15} /> : null}
      {children && <span>{children}</span>}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: 'sm' | 'md';
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = 'md', active, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('icon-btn', `icon-btn-${size}`, active && 'is-active', className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 14 : 16} />
    </button>
  );
});

// Obrazci ---------------------------------------------------------------------
export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  optional,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  optional?: boolean;
}) {
  return (
    <div className={cx('field', error && 'has-error')}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="field-optional">neobvezno</span>}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return <input ref={ref} className={cx('input', invalid && 'is-invalid', className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return <textarea ref={ref} className={cx('input', 'textarea', invalid && 'is-invalid', className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { size_?: 'sm' | 'md' }>(
  function Select({ className, children, size_ = 'md', ...rest }, ref) {
    return (
      <div className={cx('select-wrap', size_ === 'sm' && 'select-sm', className)}>
        <select ref={ref} className="input select" {...rest}>
          {children}
        </select>
        <Icon name="chevronDown" size={14} className="select-caret" />
      </div>
    );
  },
);

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className={cx('checkbox', disabled && 'is-disabled')} htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="checkbox-box" aria-hidden="true">
        <Icon name="check" size={12} />
      </span>
      {label && <span className="checkbox-label">{label}</span>}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={cx('segmented-item', value === o.value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Prikaz -----------------------------------------------------------------------
export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="spinner" style={{ width: size, height: size }} role={label ? 'status' : undefined} aria-label={label} />
  );
}

export function Skeleton({ width, height = 14, radius, className }: { width?: number | string; height?: number; radius?: number; className?: string }) {
  return <span className={cx('skeleton', className)} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

export function PageLoader({ label = 'Nalagam …' }: { label?: string }) {
  return (
    <div className="page-loader" role="status">
      <Spinner size={20} />
      <span>{label}</span>
    </div>
  );
}

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: string | boolean; className?: string }) {
  return (
    <span className={cx('badge', `badge-${tone}`, className)}>
      {dot && <span className="badge-dot" style={typeof dot === 'string' ? { background: dot } : undefined} />}
      {children}
    </span>
  );
}

export function PriorityBadge({ priority, compact }: { priority: Priority; compact?: boolean }) {
  return (
    <span className={cx('prio', `prio-${priority}`, compact && 'prio-compact')} title={`Prioriteta: ${PRIORITY_LABEL[priority]}`}>
      <span className="prio-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {!compact && PRIORITY_LABEL[priority]}
      {compact && <span className="sr-only">{PRIORITY_LABEL[priority]}</span>}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatusRef }) {
  return (
    <span className={cx('status', `status-${status.category}`)}>
      <span className="status-dot" style={{ background: status.color }} />
      {status.name}
    </span>
  );
}

export function DueBadge({ date, done, className }: { date: string | null; done?: boolean; className?: string }) {
  const info = dueInfo(date, done);
  if (!info) return null;
  return (
    <span className={cx('due', `due-${info.tone}`, className)} title={`Rok: ${date}`}>
      {info.label}
    </span>
  );
}

export function LabelChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="label-chip" style={{ ['--label' as string]: color }}>
      {name}
    </span>
  );
}

export function Avatar({ user, size = 24, ring }: { user: Pick<UserBrief, 'firstName' | 'lastName' | 'avatarColor'> & { isActive?: boolean }; size?: number; ring?: boolean }) {
  return (
    <span
      className={cx('avatar', ring && 'avatar-ring', user.isActive === false && 'avatar-inactive')}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)), background: user.avatarColor }}
      title={fullName(user)}
      aria-label={fullName(user)}
      role="img"
    >
      {initials(user)}
    </span>
  );
}

export function AvatarStack({ users, max = 3, size = 22 }: { users: UserBrief[]; max?: number; size?: number }) {
  if (!users.length) return null;
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <span className="avatar-stack" aria-label={users.map(fullName).join(', ')}>
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} ring />
      ))}
      {rest > 0 && (
        <span className="avatar avatar-more avatar-ring" style={{ width: size, height: size }}>
          +{rest}
        </span>
      )}
    </span>
  );
}

export function ProgressBar({ value, tone = 'accent', size = 'md', label }: { value: number; tone?: Tone; size?: 'sm' | 'md'; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cx('progress', `progress-${tone}`, `progress-${size}`)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  compact,
  art = 'tasks',
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  art?: 'tasks' | 'search' | 'projects' | 'inbox';
}) {
  return (
    <div className={cx('empty', compact && 'empty-compact')}>
      {!compact && <EmptyArt kind={art} />}
      <h3 className="empty-title">{title}</h3>
      {description && <p className="empty-text">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

function EmptyArt({ kind }: { kind: 'tasks' | 'search' | 'projects' | 'inbox' }) {
  return (
    <div className={cx('empty-art', `empty-art-${kind}`)} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-block" role="alert">
      <div>
        <strong>Podatkov ni bilo mogoče naložiti.</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Poskusi znova
        </Button>
      )}
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className,
  flush,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cx('card', flush && 'card-flush', className)}>
      {(title || action) && (
        <header className="card-header">
          {title && <h2 className="card-title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
