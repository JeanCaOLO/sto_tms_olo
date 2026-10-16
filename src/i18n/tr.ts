// Traducción fuera de componentes React (módulos de `lib/`, validaciones, etiquetas): usa la misma
// instancia de i18next que `useTranslation`. Dentro de un componente se prefiere `useTranslation`,
// que además lo vuelve a pintar al cambiar de idioma.

import i18n from './index';

export function tr(key: string, params?: Record<string, unknown>): string {
  return i18n.t(key, params) as string;
}

/**
 * Mapa clave → texto traducido que se resuelve en cada lectura (getter), no al cargar el módulo:
 * así un `Record<K, string>` de etiquetas sigue siendo un objeto normal pero responde al idioma activo.
 */
export function lazyLabels<K extends string>(prefix: string, keys: readonly K[]): Record<K, string> {
  const labels = {} as Record<K, string>;
  for (const key of keys) {
    Object.defineProperty(labels, key, { enumerable: true, get: () => tr(`${prefix}.${key}`) });
  }
  return labels;
}
