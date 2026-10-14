import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cx, IconButton } from './ui';
import { Icon } from './Icon';

let openLayers = 0;

/** Zaklene drsenje strani, Esc zapre, fokus se vrne na prejšnji element. */
function useLayer(open: boolean, onClose: () => void, containerRef: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    openLayers += 1;
    const layer = openLayers;
    document.body.style.overflow = 'hidden';

    const focusFirst = () => {
      const el = containerRef.current;
      if (!el) return;
      const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? el;
      target.focus({ preventScroll: true });
    };
    requestAnimationFrame(focusFirst);

    const onKey = (e: KeyboardEvent) => {
      if (layer !== openLayers) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && containerRef.current) {
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openLayers -= 1;
      if (openLayers === 0) document.body.style.overflow = '';
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, containerRef]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayer(open, onClose, ref);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={cx('modal', `modal-${size}`)} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}>
        <header className="modal-header">
          <div>
            <h2 id="modal-title" className="modal-title">
              {title}
            </h2>
            {description && <p className="modal-description">{description}</p>}
          </div>
          <IconButton icon="x" label="Zapri" onClick={onClose} size="sm" />
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  children,
  label,
  width = 640,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayer(open, onClose, ref);
  if (!open) return null;
  return createPortal(
    <div className="overlay overlay-drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        ref={ref}
        className="drawer"
        style={{ '--drawer-w': `${width}px` } as CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </aside>
    </div>,
    document.body,
  );
}

/** Pojavno okno, pripeto na sprožilni element; izrisano v portalu, da ga ne odreže overflow. */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = 'start',
  width,
  className,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  const position = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = ref.current;
    if (!a || !el) return;
    const w = width ?? Math.max(el.offsetWidth, 200);
    const h = el.offsetHeight;
    let left = align === 'end' ? a.right - w : a.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = a.bottom + 6;
    if (top + h > window.innerHeight - 8 && a.top - h - 6 > 8) top = a.top - h - 6;
    setStyle({ top, left, width });
  }, [anchor, align, width]);

  useLayoutEffect(() => {
    if (!open) return;
    position();
    const onScroll = () => position();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div ref={ref} className={cx('popover', className)} style={style}>
      {children}
    </div>,
    document.body,
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  tone?: 'danger';
  disabled?: boolean;
  hint?: string;
}

export function Menu({ trigger, items, align = 'end' }: { trigger: (props: { ref: RefObject<HTMLButtonElement | null>; onClick: () => void; 'aria-expanded': boolean }) => ReactNode; items: (MenuItem | 'divider')[]; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus());
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...(listRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <>
      {trigger({ ref: anchor, onClick: () => setOpen((o) => !o), 'aria-expanded': open })}
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align={align} className="menu">
        <div ref={listRef} role="menu" onKeyDown={onKeyDown}>
          {items.map((item, i) =>
            item === 'divider' ? (
              <div key={`d${i}`} className="menu-divider" role="separator" />
            ) : (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                className={cx('menu-item', item.tone === 'danger' && 'menu-item-danger')}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <span>{item.label}</span>
                {item.hint && <span className="menu-hint">{item.hint}</span>}
              </button>
            ),
          )}
        </div>
      </Popover>
    </>
  );
}

export interface Option {
  value: string;
  label: string;
  color?: string;
  render?: ReactNode;
  description?: string;
}

/** Izbirnik z iskanjem za eno ali več vrednosti (odgovorni, oznake, filtri). */
export function Picker({
  options,
  value,
  onChange,
  multiple = true,
  placeholder = 'Išči …',
  emptyText = 'Ni zadetkov.',
  trigger,
  align = 'start',
  footer,
  width = 260,
}: {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  emptyText?: string;
  trigger: (props: { ref: RefObject<HTMLButtonElement | null>; onClick: () => void; 'aria-expanded': boolean; open: boolean }) => ReactNode;
  align?: 'start' | 'end';
  footer?: ReactNode;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const anchor = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const toggle = (v: string) => {
    if (multiple) onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    else {
      onChange(value[0] === v ? [] : [v]);
      setOpen(false);
    }
  };

  return (
    <>
      {trigger({ ref: anchor, onClick: () => setOpen((o) => !o), 'aria-expanded': open, open })}
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align={align} width={width} className="picker">
        <div className="picker-search">
          <Icon name="search" size={14} />
          <input
            ref={inputRef}
            value={query}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter' && filtered[active]) {
                e.preventDefault();
                toggle(filtered[active].value);
              }
            }}
          />
        </div>
        <div className="picker-list" role="listbox" aria-multiselectable={multiple}>
          {filtered.length === 0 && <p className="picker-empty">{emptyText}</p>}
          {filtered.map((o, i) => {
            const selected = value.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={cx('picker-option', i === active && 'is-active', selected && 'is-selected')}
                onMouseEnter={() => setActive(i)}
                onClick={() => toggle(o.value)}
              >
                <span className={cx('picker-check', selected && 'is-checked', !multiple && 'is-radio')} aria-hidden="true">
                  {selected && <Icon name="check" size={11} />}
                </span>
                {o.render ?? (
                  <>
                    {o.color && <span className="picker-swatch" style={{ background: o.color }} />}
                    <span className="truncate">{o.label}</span>
                  </>
                )}
                {o.description && <span className="picker-desc">{o.description}</span>}
              </button>
            );
          })}
        </div>
        {footer && <div className="picker-footer">{footer}</div>}
      </Popover>
    </>
  );
}
