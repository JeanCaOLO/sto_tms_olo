import Button from '../../../../components/base/Button';
import type { CostStructureRow } from '../../../../lib/tarifas/costStructureDataSource';

interface Props {
  row: CostStructureRow;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (row: CostStructureRow) => void;
  onToggleActive: (row: CostStructureRow) => void;
  onDelete: (row: CostStructureRow) => void;
}

/** Editar, dar de baja o reactivar y eliminar una fila de la estructura. */
export function RowActions({ row, canEdit, canDelete, onEdit, onToggleActive, onDelete }: Props) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={() => onEdit(row)} disabled={!canEdit} title={canEdit ? 'Editar' : 'Tu rol no puede editar costos'}>
        <i className="ri-edit-line"></i>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggleActive(row)}
        disabled={!canEdit}
        title={!canEdit ? 'Tu rol no puede editar costos' : row.active ? 'Dar de baja' : 'Reactivar'}
      >
        <i className={row.active ? 'ri-forbid-line' : 'ri-refresh-line'}></i>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (!window.confirm(`¿Eliminar "${row.label}"?`)) return;
          onDelete(row);
        }}
        disabled={!canDelete}
        title={canDelete ? 'Eliminar' : 'Tu rol no puede eliminar costos'}
      >
        <i className="ri-delete-bin-line"></i>
      </Button>
    </div>
  );
}
