import { getFallbackViajes } from './fallback-viajes';
import type { Viaje } from './types';

// ponytail: la migración de `trips`/`trip_orders` (ver diseño acordado en
// docs/work/2026-08/) todavía no está aplicada a Supabase — no hay tabla
// real que consultar. Cuando exista, esto pasa a un fetch real con
// getFallbackViajes() como respaldo de 0 filas, igual que pedidos-api.ts.
export async function fetchViajesDespachados(): Promise<Viaje[]> {
  return getFallbackViajes().filter((v) => v.status === 'despachado');
}
