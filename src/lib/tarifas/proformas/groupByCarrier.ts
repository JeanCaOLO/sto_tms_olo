// Agrupa liquidaciones por transportista. Una proforma = un transportista. Solo entran las que siguen
// en Borrador (las demás ya están en una proforma, aprobadas, pagadas o anuladas) y no agrupadas aún.

export interface GroupableSettlement {
  id: string;
  carrierId: string | null;
  carrierName: string | null;
  totalAmount: number;
  currency: string;
  status: string;
}

export interface CarrierGroup {
  carrierId: string;
  carrierName: string;
  currency: string;
  settlements: GroupableSettlement[];
}

export function groupByCarrier(settlements: GroupableSettlement[], alreadyGrouped: Set<string>): CarrierGroup[] {
  const groups = new Map<string, CarrierGroup>();
  for (const s of settlements) {
    if (!s.carrierId || s.status !== 'Borrador' || alreadyGrouped.has(s.id)) continue;
    const group = groups.get(s.carrierId) ?? { carrierId: s.carrierId, carrierName: s.carrierName ?? s.carrierId, currency: s.currency, settlements: [] };
    group.settlements.push(s);
    groups.set(s.carrierId, group);
  }
  return [...groups.values()].sort((a, b) => a.carrierName.localeCompare(b.carrierName));
}
