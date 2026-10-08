import React, { useEffect, useId, useRef, useState } from 'react';
import { SelectChevron } from './SelectChevron';

export type AppSelectOption = {
  value: string;
  label: string;
  optionClassName?: string;
};

type AppSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  className?: string;
  wrapperClassName?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyMuted?: boolean;
  disabled?: boolean;
};

/** Кастомный select: меню строго под триггером и той же ширины. */
export function AppSelect({
  value,
  onChange,
  options,
  className = '',
  wrapperClassName = '',
  placeholder = '—',
  allowEmpty = true,
  emptyMuted = true,
  disabled = false,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const isEmpty = value === '';
  const label = isEmpty ? placeholder : (selected?.label ?? placeholder);

  return (
    <div ref={rootRef} className={`relative min-w-0 ${wrapperClassName}`.trim()}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={`relative w-full text-left ${className}`.trim()}
      >
        <span
          className={`block truncate pr-1 ${isEmpty && emptyMuted ? 'text-center text-gray-400' : ''}`.trim()}
        >
          {label}
        </span>
        <SelectChevron />
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-0.5 z-[100] max-h-40 overflow-y-auto box-border bg-white border border-gray-300 rounded-md shadow-lg"
        >
          {allowEmpty && (
            <button
              type="button"
              role="option"
              aria-selected={isEmpty}
              className="w-full px-2 py-1.5 text-xs text-center text-gray-400 hover:bg-gray-50 font-sora"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              {placeholder}
            </button>
          )}
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`w-full px-2 py-1.5 text-left text-xs hover:bg-gray-50 font-sora ${opt.optionClassName || ''}`.trim()}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
