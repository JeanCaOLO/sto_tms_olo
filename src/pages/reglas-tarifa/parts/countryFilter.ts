// Reglas: las que no tienen país son globales y aplican también acá, así que se muestran —
// esconderlas daría una lista incompleta de lo que va a correr al liquidar.
export function filterByCountry<T extends { country_id?: string }>(items: T[], countryId: string): T[] {
  return items.filter((item) => !item.country_id || item.country_id === countryId);
}

// Zonas y grupos de zonas: pertenecen a un país concreto, sin globales.
export function filterByExactCountry<T extends { country_id?: string }>(items: T[], countryId: string): T[] {
  return items.filter((item) => item.country_id === countryId);
}
