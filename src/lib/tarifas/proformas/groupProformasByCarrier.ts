// Agrupa proformas por transportista (y moneda) para aprobarlas juntas: un transportista puede tener varias
// proformas en el mismo turno (la abierta se cierra con la primera decisión y la siguiente liquidación abre otra).

import type { ProformaWithPhases } from './proformaQueries';

export interface ProformaCarrierGroup<T extends ProformaWithPhases = ProformaWithPhases> {
  /** Clave estable de la fila: transportista + moneda. */
  id: string;
  carrierId: string;
  carrierName: string;
  currency: string;
  rows: T[];
  totalAmount: number;
}

export function groupProformasByCarrier<T extends ProformaWithPhases>(rows: T[]): ProformaCarrierGroup<T>[] {
  const groups = new Map<string, ProformaCarrierGroup<T>>();
  for (const row of rows) {
    const { carrierId, carrierName, currency, totalAmount } = row.proforma;
    const id = `${carrierId}|${currency}`;
    const group = groups.get(id) ?? { id, carrierId, carrierName: carrierName || carrierId, currency, rows: [], totalAmount: 0 };
    group.rows.push(row);
    group.totalAmount = Math.round((group.totalAmount + totalAmount) * 100) / 100;
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => a.carrierName.localeCompare(b.carrierName));
}
