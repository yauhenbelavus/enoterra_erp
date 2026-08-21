import React, { useEffect, useState } from 'react';

interface WydaniaProduct {
  kod: string;
  nazwa: string;
  ilosc: number;
}

interface WydaniaTypRow {
  typ: string;
  ilosc: number;
}

interface AnalizaWydanListProps {
  refreshTrigger?: number;
  apiUrl?: string;
}

const TYP_LABELS: Record<string, { label: string; color: string }> = {
  sprzedaz: { label: 'Sprzedaż', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  probka: { label: 'Próbka', color: 'bg-green-100 text-green-800 border-green-200' },
  degustacja: { label: 'Degustacja', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  zamiana: { label: 'Zamiana', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  prezent: { label: 'Prezent', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  komis: { label: 'Komis', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  bar: { label: 'Bar', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  przesuniecie: { label: 'Przesunięcie', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  Uszkodzenie: { label: 'Uszkodzenie', color: 'bg-red-100 text-red-800 border-red-200' },
  Przeterminowanie: { label: 'Przeterminowanie', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  Utrata: { label: 'Utrata', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  Inwentaryzacja: { label: 'Inwentaryzacja', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  brak: { label: 'Brak typu', color: 'bg-gray-100 text-gray-800 border-gray-200' },
};

const getTypMeta = (typ: string) =>
  TYP_LABELS[typ] || { label: typ, color: 'bg-gray-100 text-gray-800 border-gray-200' };

export const AnalizaWydanList: React.FC<AnalizaWydanListProps> = ({
  refreshTrigger,
  apiUrl = '',
}) => {
  const [products, setProducts] = useState<WydaniaProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKod, setExpandedKod] = useState<string | null>(null);
  const [detailsByKod, setDetailsByKod] = useState<Record<string, WydaniaTypRow[]>>({});
  const [detailsLoadingKod, setDetailsLoadingKod] = useState<string | null>(null);
  const [detailsErrorByKod, setDetailsErrorByKod] = useState<Record<string, string>>({});

  const loadProducts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`${apiUrl}/api/analiza-wydan`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setProducts(data);
    } catch (err: any) {
      console.error('❌ Error loading wydania products:', err);
      setError(err.message || 'Błąd ładowania danych');
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetails = async (kod: string) => {
    if (detailsByKod[kod]) return;

    try {
      setDetailsLoadingKod(kod);
      setDetailsErrorByKod((prev) => {
        const next = { ...prev };
        delete next[kod];
        return next;
      });

      const response = await fetch(`${apiUrl}/api/analiza-wydan/${encodeURIComponent(kod)}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setDetailsByKod((prev) => ({ ...prev, [kod]: data.by_typ || [] }));
    } catch (err: any) {
      console.error(`❌ Error loading wydania details for ${kod}:`, err);
      setDetailsErrorByKod((prev) => ({
        ...prev,
        [kod]: err.message || 'Błąd ładowania danych',
      }));
    } finally {
      setDetailsLoadingKod(null);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (refreshTrigger != null) {
      setExpandedKod(null);
      setDetailsByKod({});
      setDetailsErrorByKod({});
      loadProducts();
    }
  }, [refreshTrigger]);

  useEffect(() => {
    if (expandedKod && !products.some((product) => product.kod === expandedKod)) {
      setExpandedKod(null);
    }
  }, [expandedKod, products]);

  const toggleProductDetails = async (kod: string) => {
    if (expandedKod === kod) {
      setExpandedKod(null);
      return;
    }

    setExpandedKod(kod);
    await loadDetails(kod);
  };

  if (isLoading) {
    return <div className="text-gray-600 font-sora text-sm py-4">Ładowanie danych...</div>;
  }

  if (error) {
    return <div className="text-red-600 font-sora text-sm py-4">{error}</div>;
  }

  return (
    <div className="w-full overflow-y-scroll max-h-[calc(100dvh-280px)] relative">
      <table className="w-full">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
              Kod
            </th>
            <th className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
              Nazwa
            </th>
            <th className="px-8 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-200 font-sora bg-gray-50">
              Ilość
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {products.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-8 py-8 text-center text-sm text-gray-500 font-sora">
                Brak danych o wydaniach
              </td>
            </tr>
          ) : (
            products.map((product) => {
              const isExpanded = expandedKod === product.kod;
              const typRows = isExpanded ? detailsByKod[product.kod] || [] : [];
              const isDetailsLoading = detailsLoadingKod === product.kod;
              const detailsError = detailsErrorByKod[product.kod];

              return (
                <React.Fragment key={product.kod}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleProductDetails(product.kod)}
                  >
                    <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-900 font-sora">
                      {product.kod}
                    </td>
                    <td className="px-8 py-3 text-sm text-gray-900 font-sora">
                      {product.nazwa}
                    </td>
                    <td className="px-8 py-3 whitespace-nowrap text-sm text-gray-600 font-sora">
                      {product.ilosc}
                    </td>
                  </tr>

                  {isExpanded && isDetailsLoading && (
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="px-8 py-3 text-sm text-gray-500 font-sora">
                        Ładowanie szczegółów...
                      </td>
                    </tr>
                  )}

                  {isExpanded && detailsError && (
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="px-8 py-3 text-sm text-red-600 font-sora">
                        {detailsError}
                      </td>
                    </tr>
                  )}

                  {isExpanded && !isDetailsLoading && !detailsError && typRows.length === 0 && (
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="px-8 py-3 text-sm text-gray-500 font-sora">
                        Brak danych o typach
                      </td>
                    </tr>
                  )}

                  {isExpanded &&
                    !isDetailsLoading &&
                    !detailsError &&
                    typRows.map((row) => {
                      const meta = getTypMeta(row.typ);
                      return (
                        <tr key={`${product.kod}-${row.typ}`} className="bg-gray-50">
                          <td className="px-8 py-2 pl-12 text-sm font-sora" />
                          <td className="px-8 py-2 text-sm font-sora">
                            <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium border ${meta.color}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-8 py-2 whitespace-nowrap text-sm text-gray-600 font-sora">
                            {row.ilosc}
                          </td>
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
