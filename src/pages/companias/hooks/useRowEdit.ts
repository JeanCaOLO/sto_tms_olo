import { useState } from 'react';
import type { CostStructureRow, CostRowInput } from '../../../lib/tarifas/costStructureDataSource';

// Fuera del hook a propósito: debe tener identidad estable, porque quien la usa en las dependencias
// de un efecto (CostStructureModal) entraría en un bucle de renders si cambiara en cada uno.
const emptyRow = (): CostRowInput => ({
  code: '',
  label: '',
  driver: 'FIXED',
  amount: '0',
  sign: 'ADD',
  appliesWhen: null,
  unit: null,
  active: true,
});

export function useRowEdit() {
  const [editing, setEditing] = useState<CostStructureRow | null>(null);
  const [newRow, setNewRow] = useState<CostRowInput>(emptyRow);

  const startEdit = (row: CostStructureRow) => {
    setEditing(row);
    setNewRow({
      code: row.code, label: row.label, driver: row.driver, amount: row.amount, sign: row.sign,
      appliesWhen: row.appliesWhen, unit: row.unit, active: row.active, group: row.group,
      frequency: row.frequency, frequencyQty: row.frequencyQty, unitQty: row.unitQty,
      costPerKm: row.costPerKm, truckType: row.truckType,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setNewRow(emptyRow());
  };

  return { editing, newRow, setNewRow, startEdit, cancelEdit, emptyRow };
}
