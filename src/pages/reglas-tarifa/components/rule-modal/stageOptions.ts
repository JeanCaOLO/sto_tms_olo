// Opciones de fase y de categoría del modal de reglas: una sola lista para todos los selectores.

import type { RuleCategory, Stage } from '../../../../lib/tarifas/types';

/** Las cuatro fases del motor, en orden de evaluación. */
export const PHASE_OPTIONS: { value: Stage; label: string }[] = [
  { value: 'BASE', label: 'Base (precio base de la ruta)' },
  { value: 'VARIABLE', label: 'Variable (peajes, pernocta, recargos y modificadores)' },
  { value: 'ADJUSTMENT', label: 'Ajuste (descuentos/penalidades)' },
  { value: 'TAX', label: 'Impuesto' },
];

/** Etiqueta de reporte: solo agrupa en el desglose, no cambia el cálculo. */
export const CATEGORY_OPTIONS: { value: RuleCategory | ''; label: string }[] = [
  { value: '', label: 'Sin categoría' },
  { value: 'VARIABLE', label: 'Variable' },
  { value: 'MODIFIER', label: 'Modificador (ajuste por servicio)' },
  { value: 'SURCHARGE', label: 'Recargo (pernocta, peajes y otros variables propios)' },
  { value: 'ADJUSTMENT', label: 'Ajuste' },
  { value: 'TAX', label: 'Impuesto' },
];
