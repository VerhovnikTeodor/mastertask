import { Picker, type Option } from './overlays';
import { cx } from './ui';
import { Icon } from './Icon';

/** Gumb filtra z izbirnikom; ob izbiri prikaže število oz. ime izbrane vrednosti. */
export function FilterPicker({
  label,
  options,
  value,
  onChange,
  multiple = true,
  width,
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  width?: number;
}) {
  const selected = options.filter((o) => value.includes(o.value));
  const summary = selected.length === 0 ? null : selected.length === 1 ? selected[0].label : `${selected.length} izbrani`;
  return (
    <Picker
      options={options}
      value={value}
      onChange={onChange}
      multiple={multiple}
      width={width}
      placeholder={`Filtriraj: ${label.toLowerCase()}`}
      footer={
        value.length > 0 ? (
          <button type="button" className="link-button" onClick={() => onChange([])}>
            Počisti izbor
          </button>
        ) : undefined
      }
      trigger={({ open, ...props }) => (
        <button type="button" className={cx('filter-btn', value.length > 0 && 'is-active', open && 'is-open')} {...props}>
          <span>{label}</span>
          {summary && <span className="filter-value truncate">{summary}</span>}
          <Icon name="chevronDown" size={13} />
        </button>
      )}
    />
  );
}
