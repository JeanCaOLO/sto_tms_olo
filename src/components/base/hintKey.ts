// Normalización de textos para buscar su descripción (ver `HintProvider`).

export type HintMap = Record<string, string>;

/** Clave de búsqueda: sin mayúsculas, acentos, signos, paréntesis ni asteriscos de «obligatorio». */
export function hintKey(text: string): string {
  return text
    .replace(/\$\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[*:¿?¡!…«».,·→/\-—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\d+\s+/, '');
}

/** Pasa un diccionario «texto → descripción» a su forma normalizada. */
export function buildHints(raw: HintMap): HintMap {
  return Object.fromEntries(Object.entries(raw).map(([text, hint]) => [hintKey(text), hint]));
}
