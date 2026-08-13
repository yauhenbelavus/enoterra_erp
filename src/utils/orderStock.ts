export interface ProductLineForStock {
  kod: string;
  nazwa: string;
  quantity: number;
  isSamplesRow: boolean;
  samplesOwnQuantity: number;
  totalOnStock: number;
  overallTotalOnStock?: number;
  reservedQuantity: number;
  clientReservedQuantity: number;
  clientReservedTotal?: number;
  originalQuantityInOrder?: number;
  reservationInOrder?: number;
}

export function getEffectiveClientReservation(free: number, inOrder: number = 0): number {
  return (free || 0) + (inOrder || 0);
}

export interface ReservationOverflowItem {
  kod: string;
  nazwa: string;
  ordered: number;
  inReservation: number;
  overflow: number;
  freeInReservation?: number;
  inOrderFromReservation?: number;
}

export function calculateMaxAllowed(line: ProductLineForStock): number {
  const originalQuantity = line.originalQuantityInOrder || 0;
  const reservationInOrder = line.reservationInOrder || 0;
  const rowStock = line.isSamplesRow ? line.samplesOwnQuantity : line.totalOnStock;
  const availableForEdit = rowStock + originalQuantity;
  const overallTotalOnStock = line.overallTotalOnStock ?? line.totalOnStock;
  const overallAvailableForEdit = overallTotalOnStock + originalQuantity;

  const hasClientReservation =
    line.clientReservedQuantity > 0 ||
    (line.clientReservedTotal || 0) > 0 ||
    reservationInOrder > 0;

  if (hasClientReservation) {
    const clientReservationPool = line.clientReservedQuantity + reservationInOrder;
    if (line.isSamplesRow) {
      return Math.min(availableForEdit, clientReservationPool);
    }
    if (originalQuantity > 0) {
      return availableForEdit;
    }
    const freeOnStock = Math.max(0, availableForEdit - line.reservedQuantity);
    return clientReservationPool + freeOnStock;
  }

  if (line.isSamplesRow) {
    if (originalQuantity > 0) {
      return availableForEdit;
    }
    const freeOverall = Math.max(0, overallAvailableForEdit - line.reservedQuantity);
    return Math.min(availableForEdit, freeOverall);
  }

  // При редактировании заявки возвращаем в пул количество, уже находящееся в ней
  if (originalQuantity > 0) {
    return availableForEdit;
  }

  return availableForEdit - line.reservedQuantity;
}

export function collectReservationOverflows(
  lines: ProductLineForStock[],
  editMode = false
): ReservationOverflowItem[] {
  const byKod = new Map<string, {
    nazwa: string;
    ordered: number;
    originalOrdered: number;
    clientReservedQuantity: number;
    clientReservedTotal: number;
    reservationInOrder: number;
  }>();

  lines.forEach((line) => {
    const clientReservedQuantity = line.clientReservedQuantity;
    const clientReservedTotal = line.clientReservedTotal ?? clientReservedQuantity;
    if (clientReservedTotal <= 0 && clientReservedQuantity <= 0) return;

    const displayNazwa = line.nazwa.replace(' (samples)', '');
    const existing = byKod.get(line.kod);
    if (existing) {
      existing.ordered += line.quantity;
      existing.originalOrdered += line.originalQuantityInOrder || 0;
      existing.reservationInOrder = Math.max(
        existing.reservationInOrder,
        line.reservationInOrder || 0
      );
    } else {
      byKod.set(line.kod, {
        nazwa: displayNazwa,
        ordered: line.quantity,
        originalOrdered: line.originalQuantityInOrder || 0,
        clientReservedQuantity,
        clientReservedTotal,
        reservationInOrder: line.reservationInOrder || 0
      });
    }
  });

  const overflows: ReservationOverflowItem[] = [];
  byKod.forEach((data, kod) => {
    const isExistingLine = data.originalOrdered > 0;
    const hasClientReservation = data.clientReservedTotal > 0;

    if (!hasClientReservation) return;

    if (editMode) {
      const isIncreasing = !isExistingLine || data.ordered > data.originalOrdered;
      if (isIncreasing && data.ordered > data.clientReservedTotal) {
        overflows.push({
          kod,
          nazwa: data.nazwa,
          ordered: data.ordered,
          inReservation: data.clientReservedTotal,
          overflow: data.ordered - data.clientReservedTotal
        });
      }
      return;
    }

    if (isExistingLine) {
      return;
    }

    if (data.clientReservedQuantity > 0 && data.ordered > data.clientReservedQuantity) {
      overflows.push({
        kod,
        nazwa: data.nazwa,
        ordered: data.ordered,
        inReservation: data.clientReservedQuantity,
        overflow: data.ordered - data.clientReservedQuantity
      });
    }
  });

  return overflows;
}

export async function enrichStockLinesWithClientReservations(
  lines: ProductLineForStock[],
  clientId?: number,
  orderId?: number
): Promise<ProductLineForStock[]> {
  if (!clientId || lines.length === 0) return lines;

  const kods = [...new Set(lines.map((line) => line.kod))];
  const reservationByKod = new Map<string, {
    remaining: number;
    total: number;
    fromOrder: number;
    effective: number;
  }>();

  await Promise.all(
    kods.map(async (kod) => {
      try {
        const params = new URLSearchParams({
          query: kod,
          client_id: String(clientId)
        });
        if (orderId) {
          params.set('order_id', String(orderId));
        }

        const response = await fetch(`/api/working-sheets/search?${params.toString()}`);
        if (!response.ok) return;

        const data = await response.json();
        const match =
          data.find((row: { kod: string; status?: string | null }) => row.kod === kod && row.status !== 'samples') ||
          data.find((row: { kod: string }) => row.kod === kod);

        if (match) {
          const remaining = match.ilosc_client_reserved || 0;
          const fromOrder = match.ilosc_from_reservation || 0;
          reservationByKod.set(kod, {
            remaining,
            total: match.ilosc_client_reserved_total || remaining || 0,
            fromOrder,
            effective: match.ilosc_client_reserved_effective ?? getEffectiveClientReservation(remaining, fromOrder)
          });
        }
      } catch (error) {
        console.error(`Failed to load reservation for ${kod}:`, error);
      }
    })
  );

  return lines.map((line) => {
    const reservation = reservationByKod.get(line.kod);
    if (!reservation) return line;

    return {
      ...line,
      clientReservedQuantity: reservation.remaining,
      clientReservedTotal: reservation.total,
      reservationInOrder: line.reservationInOrder ?? reservation.fromOrder
    };
  });
}

export interface StockLineWithId extends ProductLineForStock {
  lineId: number;
}

export function collectStockOverflowLineIds(lines: StockLineWithId[]): Set<number> {
  const errorsSet = new Set<number>();
  const kodGroups = new Map<string, {
    lineIds: number[];
    totalQty: number;
    totalOriginal: number;
    reservationInOrder: number;
    line: ProductLineForStock;
  }>();

  lines.forEach((line) => {
    if (!line.kod || line.quantity <= 0) return;

    const existing = kodGroups.get(line.kod);
    if (existing) {
      existing.lineIds.push(line.lineId);
      existing.totalQty += line.quantity;
      existing.totalOriginal += line.originalQuantityInOrder || 0;
      existing.reservationInOrder = Math.max(
        existing.reservationInOrder,
        line.reservationInOrder || 0
      );
    } else {
      kodGroups.set(line.kod, {
        lineIds: [line.lineId],
        totalQty: line.quantity,
        totalOriginal: line.originalQuantityInOrder || 0,
        reservationInOrder: line.reservationInOrder || 0,
        line
      });
    }
  });

  kodGroups.forEach((group) => {
    const line = group.line;
    const maxAllowed = calculateMaxAllowed({
      ...line,
      quantity: group.totalQty,
      originalQuantityInOrder: group.totalOriginal,
      reservationInOrder: group.reservationInOrder
    });

    if (group.totalQty > maxAllowed) {
      group.lineIds.forEach((lineId) => errorsSet.add(lineId));
    }
  });

  return errorsSet;
}
