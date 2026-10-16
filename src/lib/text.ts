// Comparación de texto para buscadores: sin distinguir mayúsculas, minúsculas ni acentos.

/** Minúsculas, sin diacríticos y sin espacios en los extremos. null/undefined = ''. */
export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** ¿`haystack` contiene `needle`, sin distinguir mayúsculas ni acentos? Una búsqueda vacía coincide con todo. */
export function matchesSearch(haystack: unknown, needle: string): boolean {
  const term = normalizeText(needle);
  return term === '' || normalizeText(haystack).includes(term);
}
