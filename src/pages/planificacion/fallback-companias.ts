import type { Compania } from './eflow-api';
import type { Pais } from './eflow-api';

// Compañías conocidas por país (IDCOMPANIA verificado en EFLOW 2026-09-16), para
// que el selector funcione aunque el endpoint esté lento/caído.
const POR_PAIS: Record<Pais, Compania[]> = {
  cr: [{ id: '0109', name: 'COFERSA' }],
  ve: [
    { id: '0001', name: 'FEBECA' },
    { id: '0002', name: 'SILLACA' },
  ],
};

export const fallbackCompanias = (pais: Pais): Compania[] => POR_PAIS[pais] ?? [];
