import React from 'react';

/** Стрелка раскрытия — единый стиль (образец: Waluta dostawy). */
export function ChevronDownIcon({ className = 'w-3 h-3 shrink-0 text-gray-500' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/** Для native <select> с appearance-none — абсолютное позиционирование справа. */
export function SelectChevron() {
  return (
    <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
  );
}
