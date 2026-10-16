// Hook para manejar el estado del formulario de edición de filas.

import { useState, useEffect } from 'react';
import { RATE_TABLE_WILDCARD, type RateTable, type RateTableRow } from '../../../../lib/tarifas/types';
import type { RateRowErrors } from '../../../../lib/tarifas/rateTablesDataSource';

export function useRateRowFormState(selected: RateTable | null) {
  const [draftKey, setDraftKey] = useState<string[]>([]);
  const [draftAmount, setDraftAmount] = useState('');
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<RateRowErrors>({});

  // Limpiar el borrador cuando cambia la tabla elegida.
  useEffect(() => {
    if (!selected) {
      setDraftKey([]);
      setDraftAmount('');
      setDraftValues({});
      setEditingRowId(null);
      setRowErrors({});
      return;
    }
    setDraftKey(selected.keyColumns.map(() => ''));
    setDraftAmount('');
    setDraftValues({});
    setEditingRowId(null);
    setRowErrors({});
  }, [selected]);

  const startEdit = (row: RateTableRow) => {
    if (!selected) return;
    setEditingRowId(row.id);
    setRowErrors({});
    setDraftKey(selected.keyColumns.map((_c, i) => {
      const value = row.key[i] ?? '';
      return value === RATE_TABLE_WILDCARD ? '' : value;
    }));
    setDraftAmount(row.amount);
    setDraftValues({ ...(row.values ?? {}) });
  };

  const reset = () => {
    if (!selected) return;
    setDraftKey(selected.keyColumns.map(() => ''));
    setDraftAmount('');
    setDraftValues({});
    setEditingRowId(null);
    setRowErrors({});
  };

  const updateKey = (index: number, value: string) => {
    setDraftKey((prev) => {
      const copia = [...prev];
      copia[index] = value;
      return copia;
    });
    setRowErrors((prev) => ({ ...prev, key: undefined }));
  };

  const updateAmount = (value: string) => {
    setDraftAmount(value);
    setRowErrors((prev) => ({ ...prev, amount: undefined }));
  };

  const updateValues = (name: string, value: string) => {
    setDraftValues((prev) => ({ ...prev, [name]: value }));
    setRowErrors((prev) => ({ ...prev, values: undefined }));
  };

  return {
    draftKey,
    draftAmount,
    draftValues,
    editingRowId,
    rowErrors,
    startEdit,
    reset,
    updateKey,
    updateAmount,
    updateValues,
    setRowErrors,
  };
}
