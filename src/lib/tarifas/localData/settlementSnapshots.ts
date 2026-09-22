// Snapshot liviano de margen/costo por liquidación real (`settlements.id` de Supabase).
//
// La tabla `settlements` del TMS real no soporta columnas de margen/costo/trace sin una
// migración que todavía no se corre (ver `src/lib/tarifas/repository.ts`) — así que esto vive acá,
// en el mismo almacén JSON+localStorage que el resto del motor de tarifas, indexado por el id real
// de la liquidación. Se escribe cuando `SettlementModal` guarda con éxito y se lee en
// `liquidaciones/page.tsx` para mostrar el semáforo de margen en la lista.

import { genId, loadDatabase, persist } from './store';

export interface SettlementSnapshot {
  settlement_id: string;
  margin_status: 'OK' | 'WARN' | 'CRITICAL' | 'LOSS';
  margin_amount: string;
  margin_pct: string;
  cost_total: string;
  cost_model_id: string;
  updated_at: string;
}

export function getSnapshot(settlementId: string): SettlementSnapshot | undefined {
  return loadDatabase().settlementSnapshots.find((s) => s.settlement_id === settlementId) as SettlementSnapshot | undefined;
}

export function listSnapshots(): SettlementSnapshot[] {
  return loadDatabase().settlementSnapshots.slice() as SettlementSnapshot[];
}

export function saveSnapshot(settlementId: string, data: Omit<SettlementSnapshot, 'settlement_id'>): void {
  const db = loadDatabase();
  const idx = db.settlementSnapshots.findIndex((s) => s.settlement_id === settlementId);
  const row = { id: db.settlementSnapshots[idx]?.id ?? genId('snap'), settlement_id: settlementId, ...data };
  if (idx === -1) {
    db.settlementSnapshots.push(row);
  } else {
    db.settlementSnapshots[idx] = row;
  }
  persist(db);
}

export function deleteSnapshot(settlementId: string): void {
  const db = loadDatabase();
  db.settlementSnapshots = db.settlementSnapshots.filter((s) => s.settlement_id !== settlementId);
  persist(db);
}
