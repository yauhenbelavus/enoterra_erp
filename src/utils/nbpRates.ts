import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  WalutaFakturySelection,
  formatPlMoney,
  isKursDostawyInputActive,
  isKursFakturyInputActive,
  needsKursToPln,
} from './receiptCurrency';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

type NbpRate = {
  mid: number;
  requestedDate: string;
  effectiveDate: string;
};

function toIsoDate(date: Date): string {
  return date.toLocaleDateString('en-CA');
}

function neededCodes(
  walutaDostawy: WalutaFakturySelection,
  walutaFaktury: WalutaFakturySelection
): string[] {
  const codes = new Set<string>();
  if (needsKursToPln(walutaDostawy)) codes.add(walutaDostawy);
  if (needsKursToPln(walutaFaktury)) codes.add(walutaFaktury);
  return [...codes];
}

export async function fetchNbpRates(
  date: string,
  codes: string[],
  signal?: AbortSignal
): Promise<Record<string, NbpRate>> {
  if (!date || codes.length === 0) return {};
  const params = new URLSearchParams({ date, codes: codes.join(',') });
  const response = await fetch(`${API_URL}/api/nbp/rates?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error('nbp');
  }
  const payload = await response.json() as { rates?: Record<string, NbpRate> };
  return payload.rates || {};
}

export function NbpKursSpinner() {
  return (
    <div
      className="h-3 w-3 shrink-0 animate-spin rounded-full border-b-2 border-blue-500"
      aria-hidden="true"
    />
  );
}

export function KursInputSpinner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2">
      <NbpKursSpinner />
    </div>
  );
}

export function usePurchaseNbpRates(options: {
  selectedDate: Date | null;
  walutaDostawy: WalutaFakturySelection;
  walutaFaktury: WalutaFakturySelection;
  setKursDostawy: (value: string) => void;
  setKursFaktury: (value: string) => void;
  enabled?: boolean;
  skipInitial?: boolean;
}): { isLoading: boolean } {
  const {
    selectedDate,
    walutaDostawy,
    walutaFaktury,
    setKursDostawy,
    setKursFaktury,
    enabled = true,
    skipInitial = false,
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const previousSignatureRef = useRef<string | null>(null);
  const dateKey = selectedDate ? toIsoDate(selectedDate) : '';
  const signature = `${dateKey}|${walutaDostawy}|${walutaFaktury}`;

  useEffect(() => {
    if (!enabled) return;

    if (skipInitial && previousSignatureRef.current === null) {
      previousSignatureRef.current = signature;
      return;
    }
    if (previousSignatureRef.current === signature) return;
    previousSignatureRef.current = signature;

    if (!selectedDate) {
      setIsLoading(false);
      return;
    }
    const codes = neededCodes(walutaDostawy, walutaFaktury);
    if (codes.length === 0) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const date = toIsoDate(selectedDate);
    setIsLoading(true);

    void (async () => {
      try {
        const rates = await fetchNbpRates(date, codes, controller.signal);
        if (controller.signal.aborted) return;

        const missing = codes.filter((code) => !rates[code]);
        if (isKursDostawyInputActive(walutaDostawy) && rates[walutaDostawy]) {
          setKursDostawy(formatPlMoney(rates[walutaDostawy].mid));
        }
        if (isKursFakturyInputActive(walutaDostawy, walutaFaktury) && rates[walutaFaktury]) {
          setKursFaktury(formatPlMoney(rates[walutaFaktury].mid));
        }
        if (missing.length > 0) {
          toast.error('Nie znaleziono kursu NBP dla wybranej daty');
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        toast.error('Nie udało się pobrać kursu NBP');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [
    enabled,
    skipInitial,
    selectedDate,
    signature,
    walutaDostawy,
    walutaFaktury,
    setKursDostawy,
    setKursFaktury,
  ]);

  return { isLoading };
}
