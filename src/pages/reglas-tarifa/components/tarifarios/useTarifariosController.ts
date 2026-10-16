// Hook principal para la gestión de tarifarios: carga de datos, estado de filas y tablas.

import { useTarifariosState } from './useTarifariosState';
import { useTarifariosActions } from './useTarifariosActions';

export function useTarifariosController(countryId: string, partyId?: string) {
  const { state, setState, selected, loadTables, loadRows, selectTable } = useTarifariosState(countryId, partyId);
  const actions = useTarifariosActions({ state, setState, selected, loadTables, loadRows, selectTable });

  return { ...state, selected, selectTable, ...actions, loadTables, loadRows };
}
