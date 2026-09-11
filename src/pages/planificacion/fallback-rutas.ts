import type { RutaTipo } from './types';

// ponytail: route_types has a stricter read RLS policy than the other catalogs
// used in this page and returns zero rows without a real authenticated
// session, so this fallback stands in.
//
// 2026-08-31: replaced the 5 synthetic GAM routes with the real route catalog
// from eflow QA (`EFLOW_WMH.distribution_routes`, snapshot — ver memoria
// `eflow-qa-db-rutas-choferes`). The first two IDs stay the real Supabase
// UUIDs that existing `orders.route_type_id` already reference; the rest carry
// deterministic `eflow-rt-<route_code>` ids. `code` is the eflow route_code.
// Pairs with fallback-pedidos.ts, which generates synthetic stops for any
// route_type_id with 0 real pending orders. Remove once real auth/RLS is wired
// and route_types is reliably readable.
export const FALLBACK_RUTAS: RutaTipo[] = [
  { id: '0444c597-05dc-4643-8004-c4679d1fe971', name: '01 · Casco Central' },
  { id: 'ac5f5e85-64b8-4264-ba4f-7660dfd4a52a', name: '02 · Desamparados San José Sur-Oeste' },
  { id: 'eflow-rt-03', name: '03 · Guadalupe San José Norte-Oeste' },
  { id: 'eflow-rt-04', name: '04 · Alajuela' },
  { id: 'eflow-rt-05', name: '05 · Heredia' },
  { id: 'eflow-rt-06', name: '06 · Cartago' },
  { id: 'eflow-rt-07', name: '07 · Carretera' },
  { id: 'eflow-rt-08', name: '08 · San Carlos' },
  { id: 'eflow-rt-09', name: '09 · Limón' },
  { id: 'eflow-rt-10', name: '10 · Guanacaste Altura' },
  { id: 'eflow-rt-11', name: '11 · Guanacaste Bajura' },
  { id: 'eflow-rt-12', name: '12 · Zona Sur' },
  { id: 'eflow-rt-13', name: '13 · Puntarenas' },
  { id: 'eflow-rt-15', name: '15 · Turrialba' },
  { id: 'eflow-rt-16', name: '16 · Corralillo' },
];
