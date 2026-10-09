// Etiquetas de grupos de costos: reutilizadas entre estructura y resumen.
import type { CostGroup } from '../../../lib/tarifas/types';

export const GROUP_LABELS: Record<CostGroup, string> = {
  conductor: 'Conductor',
  ayudante: 'Ayudante',
  depreciacion: 'Depreciación',
  mantenimiento: 'Mantenimiento',
  otros: 'Otros',
};
