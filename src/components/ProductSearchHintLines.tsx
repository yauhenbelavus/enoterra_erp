import React from 'react';

interface ProductSearchHintLinesProps {
  kod: string;
  nazwa: string;
  sprzedawca?: string | null;
  children?: React.ReactNode;
}

function formatDisplayNazwa(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  const letters = trimmed.replace(/[^A-Za-zÀ-žĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '');
  if (letters.length > 0 && letters === letters.toUpperCase()) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }

  return trimmed;
}

export const ProductSearchHintLines: React.FC<ProductSearchHintLinesProps> = ({
  kod,
  nazwa,
  sprzedawca,
  children
}) => {
  const isSamples = nazwa.includes(' (samples)');
  const rawNazwa = isSamples ? nazwa.replace(' (samples)', '').trim() : nazwa;
  const displayNazwa = formatDisplayNazwa(rawNazwa);

  return (
    <>
      {sprzedawca?.trim() && (
        <span className="text-[10px] text-gray-500 italic">{sprzedawca}</span>
      )}
      <div className="text-[10px] font-medium">
        {isSamples ? (
          <>
            {kod} {displayNazwa} <span>(samples)</span>
          </>
        ) : (
          <span>{kod} {displayNazwa}</span>
        )}
      </div>
      {children}
    </>
  );
};
