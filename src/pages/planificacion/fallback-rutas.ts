import type { RutaTipo } from './types';

// ponytail: route_types has a stricter read RLS policy than the other catalogs
// used in this page (vehicles/carriers/drivers all read fine anonymously) and
// returns zero rows without a real authenticated session. These are the real
// IDs that existing orders.route_type_id already reference, kept only as a
// fallback so the dropdown works during prototyping. Remove once real
// auth/RLS is wired up and route_types is readable again.
export const FALLBACK_RUTAS: RutaTipo[] = [
  { id: '0444c597-05dc-4643-8004-c4679d1fe971', name: 'Ruta 1 (fallback, RLS bloquea route_types)' },
  { id: 'ac5f5e85-64b8-4264-ba4f-7660dfd4a52a', name: 'Ruta 2 (fallback, RLS bloquea route_types)' },
];
