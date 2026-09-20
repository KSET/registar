import { useState, useRef, useEffect } from 'react';

export function TextField({ name, label, value, onChange, onBlur, error, type = 'text', required, ...rest }) {
  return (
    <div className="mb-4">
      <label className="label" htmlFor={name}>
        {label} {required && <span className="text-brand-orange">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
        onBlur={() => onBlur(name)}
        className={`input ${error ? 'input-error' : ''}`}
        {...rest}
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function SelectField({ name, label, value, onChange, onBlur, error, options, placeholder = '-- Odaberite --', required }) {
  return (
    <div className="mb-4">
      <label className="label" htmlFor={name}>
        {label} {required && <span className="text-brand-orange">*</span>}
      </label>
      <select
        id={name}
        name={name}
        value={value ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
        onBlur={() => onBlur(name)}
        className={`input ${error ? 'input-error' : ''}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function MultiCheckDropdown({ name, label, value, onChange, onBlur, error, options, required, placeholder = 'Odaberite...' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = value || [];

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        if (onBlur) onBlur(name);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open, name, onBlur]);

  const toggle = (id) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange(name, next);
  };

  const selectedNames = options.filter((o) => selected.includes(o.id)).map((o) => o.name);
  const summary =
    selectedNames.length === 0
      ? placeholder
      : selectedNames.length <= 3
      ? selectedNames.join(', ')
      : `${selectedNames.slice(0, 3).join(', ')} +${selectedNames.length - 3}`;

  return (
    <div className="mb-4" ref={ref}>
      <label className="label">
        {label} {required && <span className="text-brand-orange">*</span>}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`input flex items-center justify-between text-left ${error ? 'input-error' : ''} ${selectedNames.length === 0 ? 'text-content-muted' : ''}`}
        >
          <span className="truncate">{summary}</span>
          <span className="ml-2 text-content-muted">{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto bg-surface-raised border border-surface-border rounded-md shadow-lg">
            {options.length === 0 && <div className="px-3 py-2 text-sm text-content-muted">Nema opcija.</div>}
            {options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 px-3 py-2 text-sm text-content-primary hover:bg-surface-overlay cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={() => toggle(o.id)}
                  className="h-4 w-4 accent-brand-orange"
                />
                {o.name}
              </label>
            ))}
          </div>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export function CheckboxField({ name, label, value, onChange, onBlur, error }) {
  return (
    <div className="mb-4">
      <label className="flex items-center gap-2 text-sm text-content-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(name, e.target.checked)}
          onBlur={() => onBlur(name)}
          className="h-4 w-4 accent-brand-orange"
        />
        {label}
      </label>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
