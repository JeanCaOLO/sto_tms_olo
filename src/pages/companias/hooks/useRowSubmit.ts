import {
  addRow, deleteRow, updateRow, type CostRowInput, type CostStructureRow,
} from '../../../lib/tarifas/costStructureDataSource';
import type { CostStructure } from '../../../lib/tarifas/types';
import { codeForRow, validateRowInput, type CheckedRow } from '../components/cost-structure/rowInput';
import { messageOf } from './costStructureContext';

interface Params {
  editing: CostStructureRow | null;
  newRow: CostRowInput;
  setNewRow: (row: CostRowInput) => void;
  emptyRow: () => CostRowInput;
  cancelEdit: () => void;
  blockedByInherited: boolean;
  ensureStructure: () => Promise<CostStructure | null>;
  setError: (message: string) => void;
  load: () => Promise<void>;
}

/** Alta y edición de filas de la estructura, y las acciones sueltas (dar de baja, reactivar, eliminar). */
export function useRowSubmit(p: Params) {
  const { editing, newRow, setError, load } = p;

  const saveEdit = async (checked: CheckedRow, current: CostStructureRow) => {
    const { amount, truckType } = checked;
    if ((current.truckType ?? null) !== truckType) {
      const removed = await deleteRow(current.id);
      if (removed.error) { setError(removed.error); return; }
      const created = await addRow(current.structureId, { ...newRow, amount, truckType });
      if (created.error) { setError(created.error); return; }
    } else {
      const result = await updateRow(current.id, {
        label: newRow.label.trim(), driver: newRow.driver, amount, sign: newRow.sign,
      });
      if (result.error) { setError(result.error); return; }
    }
    p.cancelEdit();
    await load();
  };

  const createRow = async (checked: CheckedRow) => {
    const target = await p.ensureStructure();
    if (!target) return;
    const result = await addRow(target.id, { ...newRow, amount: checked.amount, code: codeForRow(newRow), truckType: checked.truckType });
    if (result.error) { setError(result.error); return; }
    p.setNewRow(p.emptyRow());
    await load();
  };

  const handleSubmitRow = async () => {
    setError('');
    const checked = validateRowInput(newRow, p.blockedByInherited && !editing);
    if ('error' in checked) { setError(checked.error); return; }
    try {
      if (editing) await saveEdit(checked, editing);
      else await createRow(checked);
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const handleRowAction = async (action: () => Promise<{ error: string | null }>) => {
    setError('');
    try {
      const result = await action();
      if (result.error) { setError(result.error); return; }
      await load();
    } catch (e) {
      setError(messageOf(e));
    }
  };

  return { handleSubmitRow, handleRowAction };
}
