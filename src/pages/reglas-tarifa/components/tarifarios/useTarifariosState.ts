// Estado y carga de datos de los tarifarios: lista, filas de la tabla elegida y tipos de camión.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadTarifariosData, loadTruckTypes, getRateTableRows } from '../../api/tarifariosApi';
import { INITIAL_TARIFARIOS_STATE, type TarifariosState } from './tarifariosState';

export function useTarifariosState(countryId: string, partyId?: string) {
  const [state, setState] = useState<TarifariosState>(INITIAL_TARIFARIOS_STATE);

  const selected = useMemo(
    () => state.tables.find((t) => t.id === state.selectedId) ?? null,
    [state.tables, state.selectedId],
  );

  const loadTables = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, loadError: '' }));
    try {
      const data = await loadTarifariosData(countryId, partyId);
      setState((s) => ({ ...s, ...data, loading: false }));
    } catch (error) {
      console.error('Error cargando tarifarios:', error);
      setState((s) => ({ ...s, loading: false, loadError: 'No se pudieron cargar los tarifarios.' }));
    }
  }, [countryId, partyId]);

  const loadRows = useCallback(async (tableId: string) => {
    setState((s) => ({ ...s, loadingRows: true }));
    try {
      const rows = await getRateTableRows(tableId);
      setState((s) => ({ ...s, rows, loadingRows: false }));
    } catch (error) {
      console.error('Error cargando filas del tarifario:', error);
      setState((s) => ({ ...s, loadingRows: false, generalError: 'No se pudieron cargar las filas del tarifario.' }));
    }
  }, []);

  const loadTrucksForCarrier = useCallback(async (carrierId?: string) => {
    try {
      const codes = await loadTruckTypes(carrierId);
      setState((s) => ({ ...s, truckCodes: codes }));
    } catch (error) {
      console.error('Error cargando tipos de camión:', error);
      setState((s) => ({ ...s, truckCodes: [] }));
    }
  }, []);

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  useEffect(() => {
    if (!selected) {
      setState((s) => ({ ...s, rows: [] }));
      return;
    }
    const carrierId = state.parties.find((p) => p.partyId === selected.partyId)?.carrierId;
    void loadTrucksForCarrier(carrierId);
    void loadRows(selected.id);
  }, [selected, state.parties, loadRows, loadTrucksForCarrier]);

  const selectTable = (id: string | null) => {
    setState((s) => ({
      ...s,
      selectedId: id === s.selectedId ? null : id,
      editingRowId: null,
    }));
  };

  return { state, setState, selected, loadTables, loadRows, selectTable };
}
