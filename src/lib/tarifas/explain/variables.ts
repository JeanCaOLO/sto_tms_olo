// Variables usadas en el cálculo de una liquidación.

import { varLabel } from '../format';
import type { TraceLine, VarKey } from '../types';

/**
 * Qué números del viaje entraron en el cálculo.
 *
 * Es la unión de los `inputs` de todas las líneas aplicadas, o sea exactamente los datos que
 * MIRÓ el motor. Lo que no está acá no influyó en el total — y saber eso es la mitad de una
 * auditoría: "cargué el peso y no cambió nada" tiene una respuesta concreta.
 */
export function variablesUsadas(
  trace: TraceLine[],
  customLabels: Record<string, string> = {},
): { key: string; label: string; value: string }[] {
  const vistas = new Map<string, string>();

  for (const line of trace) {
    for (const [key, value] of Object.entries(line.inputs)) {
      // `rate`, `amount`, `pct` y `cada` son parámetros de la REGLA, no datos del viaje.
      if (['rate', 'amount', 'pct', 'base', 'cada', 'tabla', 'driver', 'unidades', 'importe', 'frecuencia', 'costo por km'].includes(key)) continue;
      if (!vistas.has(key)) vistas.set(key, String(value));
    }
  }

  return [...vistas.entries()].map(([key, value]) => ({
    key,
    label: varLabel(key as VarKey, customLabels),
    value,
  }));
}
