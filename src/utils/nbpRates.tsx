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
  walutaFaktury: WalutaFakturySelection,
  fields: { dostawy: boolean; faktury: boolean }
): string[] {
  const codes = new Set<string>();
  if (fields.dostawy && needsKursToPln(walutaDostawy)) codes.add(walutaDostawy);
  if (fields.faktury && needsKursToPln(walutaFaktury)) codes.add(walutaFaktury);
  return [...codes];
}

function parseSignature(signature: string): {
  date: string;
  walutaDostawy: WalutaFakturySelection;
  walutaFaktury: WalutaFakturySelection;
} {
  const [date = '', walutaDostawy = '', walutaFaktury = ''] = signature.split('|');
  return {
    date,
    walutaDostawy: walutaDostawy as WalutaFakturySelection,
    walutaFaktury: walutaFaktury as WalutaFakturySelection,
  };
}

function fieldsToLoad(
  previousSignature: string | null,
  selectedDate: Date | null,
  walutaDostawy: WalutaFakturySelection,
  walutaFaktury: WalutaFakturySelection
): { dostawy: boolean; faktury: boolean } {
  const dostawyActive = isKursDostawyInputActive(walutaDostawy);
  const fakturyActive = isKursFakturyInputActive(walutaDostawy, walutaFaktury);
  if (!selectedDate) return { dostawy: false, faktury: false };

  if (previousSignature === null) {
    return { dostawy: dostawyActive, faktury: fakturyActive };
  }

  const previous = parseSignature(previousSignature);
  const dateChanged = previous.date !== toIsoDate(selectedDate);
  if (dateChanged) {
    return { dostawy: dostawyActive, faktury: fakturyActive };
  }

  const wasFakturyActive = isKursFakturyInputActive(previous.walutaDostawy, previous.walutaFaktury);
  return {
    dostawy: dostawyActive && previous.walutaDostawy !== walutaDostawy,
    faktury: fakturyActive && (previous.walutaFaktury !== walutaFaktury || !wasFakturyActive),
  };
}

const NBP_NOT_FOUND_MESSAGE = 'Nie znaleziono kursu NBP dla wybranej daty';
const NBP_UNAVAILABLE_MESSAGE = 'Serwis NBP jest niedostępny. Spróbuj ponownie.';
const NBP_NETWORK_MESSAGE = 'Nie udało się pobrać kursu NBP. Brak połączenia z internetem.';
const NBP_NOT_FOUND_TOAST_MS = 10000;

function formatPlDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}.${month}.${year}`;
}

function nbpFallbackRateMessage(requestedDate: string, effectiveDate: string): string {
  const from = formatPlDate(effectiveDate);
  const today = toIsoDate(new Date());
  if (requestedDate === today) {
    return `Na dziś nie ma kursu NBP. Wprowadzono kurs z dnia ${from}.`;
  }
  return `Na ${formatPlDate(requestedDate)} nie ma kursu NBP. Wprowadzono kurs z dnia ${from}.`;
}

class NbpNotFoundError extends Error {
  constructor() {
    super(NBP_NOT_FOUND_MESSAGE);
    this.name = 'NbpNotFoundError';
  }
}

class NbpUnavailableError extends Error {
  constructor() {
    super(NBP_UNAVAILABLE_MESSAGE);
    this.name = 'NbpUnavailableError';
  }
}

export async function fetchNbpRates(
  date: string,
  codes: string[],
  signal?: AbortSignal
): Promise<Record<string, NbpRate>> {
  if (!date || codes.length === 0) return {};
  const params = new URLSearchParams({ date, codes: codes.join(',') });
  const response = await fetch(`${API_URL}/api/nbp/rates?${params.toString()}`, { signal });
  if (response.status === 404) {
    throw new NbpNotFoundError();
  }
  if (response.status === 502) {
    throw new NbpUnavailableError();
  }
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
}): { isLoading: boolean; isLoadingDostawy: boolean; isLoadingFaktury: boolean } {
  const {
    selectedDate,
    walutaDostawy,
    walutaFaktury,
    setKursDostawy,
    setKursFaktury,
    enabled = true,
    skipInitial = false,
  } = options;

  const [loadingFields, setLoadingFields] = useState({ dostawy: false, faktury: false });
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

    const previousSignature = previousSignatureRef.current;
    previousSignatureRef.current = signature;

    const fields = fieldsToLoad(previousSignature, selectedDate, walutaDostawy, walutaFaktury);
    if (!selectedDate || (!fields.dostawy && !fields.faktury)) {
      setLoadingFields({ dostawy: false, faktury: false });
      return;
    }
    const codes = neededCodes(walutaDostawy, walutaFaktury, fields);
    if (codes.length === 0) {
      setLoadingFields({ dostawy: false, faktury: false });
      return;
    }

    const controller = new AbortController();
    const date = toIsoDate(selectedDate);
    setLoadingFields(fields);

    void (async () => {
      try {
        const rates = await fetchNbpRates(date, codes, controller.signal);
        if (controller.signal.aborted) return;

        const missing = codes.filter((code) => !rates[code]);
        const applied: NbpRate[] = [];
        if (fields.dostawy && rates[walutaDostawy]) {
          setKursDostawy(formatPlMoney(rates[walutaDostawy].mid));
          applied.push(rates[walutaDostawy]);
        }
        if (fields.faktury && rates[walutaFaktury]) {
          setKursFaktury(formatPlMoney(rates[walutaFaktury].mid));
          applied.push(rates[walutaFaktury]);
        }
        const fallback = applied.find((rate) => rate.effectiveDate && rate.effectiveDate !== rate.requestedDate);
        if (fallback) {
          toast.error(nbpFallbackRateMessage(fallback.requestedDate, fallback.effectiveDate), {
            duration: NBP_NOT_FOUND_TOAST_MS,
          });
        }
        if (missing.length > 0) {
          toast.error(NBP_NOT_FOUND_MESSAGE, { duration: NBP_NOT_FOUND_TOAST_MS });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof NbpNotFoundError) {
          toast.error(NBP_NOT_FOUND_MESSAGE, { duration: NBP_NOT_FOUND_TOAST_MS });
          return;
        }
        if (err instanceof NbpUnavailableError) {
          toast.error(NBP_UNAVAILABLE_MESSAGE, { duration: NBP_NOT_FOUND_TOAST_MS });
          return;
        }
        toast.error(NBP_NETWORK_MESSAGE, { duration: NBP_NOT_FOUND_TOAST_MS });
      } finally {
        if (!controller.signal.aborted) setLoadingFields({ dostawy: false, faktury: false });
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

  return {
    isLoading: loadingFields.dostawy || loadingFields.faktury,
    isLoadingDostawy: loadingFields.dostawy,
    isLoadingFaktury: loadingFields.faktury,
  };
}
