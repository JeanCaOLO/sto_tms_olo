// Acciones sobre tarifarios y sus filas: guardar, eliminar y activar/desactivar.

import type { RateTable, RateTableRow } from '../../../../lib/tarifas/types';
import {
  toggleRateTable, removeRateTable, removeRateRow, createOrUpdateRateRow, type RateRowFormInput,
} from '../../api/tarifariosApi';
import type { SetTarifariosState, TarifariosState } from './tarifariosState';
import { confirmAction } from '../../../../lib/confirm';

interface Params {
  state: TarifariosState;
  setState: SetTarifariosState;
  selected: RateTable | null;
  loadTables: () => Promise<void>;
  loadRows: (tableId: string) => Promise<void>;
  selectTable: (id: string | null) => void;
}

export function useTarifariosActions({ state, setState, selected, loadTables, loadRows, selectTable }: Params) {
  const startEditRow = (row: RateTableRow) => {
    setState((s) => ({ ...s, editingRowId: row.id, generalError: '' }));
  };

  const resetRowForm = () => {
    setState((s) => ({ ...s, editingRowId: null }));
  };

  const saveRow = async (input: RateRowFormInput) => {
    setState((s) => ({ ...s, generalError: '' }));
    const result = await createOrUpdateRateRow(input, state.editingRowId ?? undefined);
    if (result.status === 'invalid' || result.status === 'failed') {
      setState((s) => ({ ...s, generalError: result.status === 'failed' ? result.error.message : '' }));
      return result;
    }
    if (selected) {
      await loadRows(selected.id);
      resetRowForm();
    }
    return result;
  };

  const deleteRow = async (rowId: string) => {
    try {
      const { error } = await removeRateRow(rowId, selected?.id);
      if (error) {
        setState((s) => ({ ...s, generalError: `No se pudo eliminar la fila: ${error}` }));
        return;
      }
      if (state.editingRowId === rowId) resetRowForm();
      if (selected) await loadRows(selected.id);
    } catch (error) {
      console.error('Error eliminando fila:', error);
      setState((s) => ({ ...s, generalError: 'No se pudo eliminar la fila.' }));
    }
  };

  const toggleTable = async (table: RateTable) => {
    try {
      const { error } = await toggleRateTable(table.id, table.active, table.code);
      if (error) {
        setState((s) => ({ ...s, loadError: `No se pudo cambiar el estado: ${error}` }));
        return;
      }
      await loadTables();
    } catch (error) {
      console.error('Error cambiando estado:', error);
      setState((s) => ({ ...s, loadError: 'No se pudo cambiar el estado del tarifario.' }));
    }
  };

  const deleteTable = async (table: RateTable) => {
    if (!(await confirmAction({
      title: 'Eliminar tarifario',
      message: `¿Eliminar "${table.code}" y todas sus filas? Las reglas que lo nombren van a usar su importe de respaldo.`,
      confirmLabel: 'Eliminar',
    }))) return;
    try {
      const { error } = await removeRateTable(table.id, table.code);
      if (error) {
        setState((s) => ({ ...s, loadError: `No se pudo eliminar: ${error}` }));
        return;
      }
      if (state.selectedId === table.id) selectTable(null);
      await loadTables();
    } catch (error) {
      console.error('Error eliminando tarifario:', error);
      setState((s) => ({ ...s, loadError: 'No se pudo eliminar el tarifario.' }));
    }
  };

  return { startEditRow, resetRowForm, saveRow, deleteRow, toggleTable, deleteTable };
}
