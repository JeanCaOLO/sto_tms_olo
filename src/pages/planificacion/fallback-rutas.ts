import type { RutaTipo } from './types';

// ponytail: route_types has a stricter read RLS policy than the other catalogs
// used in this page (vehicles/carriers/drivers all read fine anonymously) and
// returns zero rows without a real authenticated session. The first two IDs
// are real (existing orders.route_type_id already reference them); the rest
// are purely synthetic mock IDs. All of them pair with fallback-pedidos.ts,
// which generates synthetic stops for any route_type_id with 0 real pending
// orders — needed because the shared dev DB's real pending orders get
// consumed by teammates testing in parallel. Remove once real auth/RLS is
// wired up and route_types/orders are reliably readable.
export const FALLBACK_RUTAS: RutaTipo[] = [
  { id: '0444c597-05dc-4643-8004-c4679d1fe971', name: 'Ruta GAM Norte' },
  { id: 'ac5f5e85-64b8-4264-ba4f-7660dfd4a52a', name: 'Ruta GAM Sur' },
  { id: 'aaaaaaaa-1111-1111-1111-111111111111', name: 'Ruta GAM Centro' },
  { id: 'aaaaaaaa-2222-2222-2222-222222222222', name: 'Ruta GAM Oriente' },
  { id: 'aaaaaaaa-3333-3333-3333-333333333333', name: 'Ruta Rural (Provincias)' },
];
