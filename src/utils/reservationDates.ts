export const stripTime = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/** Минимальная дата окончания — следующий день после даты создания */
export const getMinReservationEndDate = (startDate: Date) => {
  const min = stripTime(startDate);
  min.setDate(min.getDate() + 1);
  return min;
};

export const isValidReservationEndDate = (start: Date | null, end: Date | null) => {
  if (!start || !end) return false;
  return stripTime(end).getTime() >= getMinReservationEndDate(start).getTime();
};

export const toDateOnlyString = (date: Date) => date.toISOString().split('T')[0];

/** Техническая дата окончания для status = 'bezterminowa' (в UI показывается ∞) */
export const INDEFINITE_RESERVATION_END_DATE = '9999-12-31';

export const isIndefiniteReservation = (reservation: {
  status?: string;
  data_zakonczenia?: string | null;
}) => {
  if (reservation.status === 'bezterminowa') return true;
  const endDate = reservation.data_zakonczenia?.slice(0, 10);
  return endDate === INDEFINITE_RESERVATION_END_DATE;
};

export const getEffectiveReservationStatus = (reservation: {
  status?: string;
  data_zakonczenia?: string | null;
}) => (isIndefiniteReservation(reservation) ? 'bezterminowa' : (reservation.status || 'aktywna'));

export const RESERVATION_STATUS_FILTER_OPTIONS = [
  'aktywna',
  'bezterminowa',
  'zrealizowana',
  'wygasła',
  'anulowana',
] as const;

export const isActiveReservationStatus = (status: string) =>
  status === 'aktywna' || status === 'bezterminowa';

export const isEndDateAfterStart = (startDateStr: string, endDateStr: string) =>
  endDateStr > startDateStr;
