// Filas que lee la pantalla de Reglas de tarifa del catálogo local (snake_case, como las guarda la base).
// Solo se tipan los campos que la pantalla usa; el resto se conserva tal cual para mostrarlo y guardarlo.

export interface RuleRow {
  id: string;
  code: string;
  name: string;
  scope: string;
  description?: string | null;
  reason?: string | null;
  stage?: string;
  stacking: string;
  priority?: number;
  active?: boolean;
  party_id?: string | null;
  country_id?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  [key: string]: unknown;
}

export interface ZoneRow {
  id: string;
  code: string;
  name: string;
  country_id?: string;
  status?: string;
  zone_groups?: { name: string };
  countries?: { name: string };
  [key: string]: unknown;
}
