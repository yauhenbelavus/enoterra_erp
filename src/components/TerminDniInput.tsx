import React from 'react';

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
        className="min-w-0 flex-1 h-full box-border pl-3 pr-1 border-0 focus:outline-none font-sora text-xs text-left placeholder:text-gray-400 bg-transparent"
      />
      <div className="w-[18px] shrink-0 self-stretch flex flex-col border-l border-gray-300">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Zwiększ dni"
          onClick={() => commit(parseDni(value) + 1)}
          className="flex-1 min-h-0 flex items-center justify-center hover:bg-gray-100 text-gray-500 leading-none"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7.5L6 4.5L9 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Zmniejsz dni"
          onClick={() => commit(parseDni(value) - 1)}
          className="flex-1 min-h-0 flex items-center justify-center hover:bg-gray-100 text-gray-500 leading-none border-t border-gray-300"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 4.5L6 7.5L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
