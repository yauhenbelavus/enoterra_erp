import React from 'react';
import { ChevronDownIcon } from './SelectChevron';

type TerminDniInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

const parseDni = (value: string): number => {
  if (value === '') return 0;
  return Math.max(0, Math.round(Number(value)) || 0);
};

const formatDni = (days: number): string => (days > 0 ? String(days) : '');

export function TerminDniInput({ value, onChange, className = '' }: TerminDniInputProps) {
  const commit = (days: number) => {
    onChange(formatDni(Math.max(0, days)));
  };

  return (
    <div
      className={`flex w-[78px] h-[30px] box-border border border-gray-300 rounded-md overflow-hidden bg-white focus-within:border-gray-300 ${className}`.trim()}
    >
      <input
        type="text"
        inputMode="numeric"
        placeholder="0"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '' || /^\d*$/.test(v)) onChange(v);
        }}
        className="min-w-0 flex-1 h-full box-border px-1 border-0 focus:outline-none font-sora text-xs text-center placeholder:text-gray-400 bg-transparent"
      />
      <div className="w-[18px] shrink-0 self-stretch flex flex-col border-l border-gray-300">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Zwiększ dni"
          onClick={() => commit(parseDni(value) + 1)}
          className="flex-1 min-h-0 flex items-center justify-center hover:bg-gray-100 leading-none"
        >
          <ChevronDownIcon className="w-3 h-3 text-gray-500 rotate-180" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Zmniejsz dni"
          onClick={() => commit(parseDni(value) - 1)}
          className="flex-1 min-h-0 flex items-center justify-center hover:bg-gray-100 leading-none border-t border-gray-300"
        >
          <ChevronDownIcon className="w-3 h-3 text-gray-500" />
        </button>
      </div>
    </div>
  );
}
