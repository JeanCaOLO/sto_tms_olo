import type { RateTable } from '../../../../lib/tarifas/types';

interface Props {
  table: RateTable;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (table: RateTable) => void;
  onToggle: (table: RateTable) => void;
  onDelete: (table: RateTable) => void;
}

/** Editar, desactivar o reactivar y eliminar un tarifario de la lista. */
export function RateTableActions({ table: t, canEdit, canDelete, onEdit, onToggle, onDelete }: Props) {
  return (
    <>
      <button
        onClick={() => onEdit(t)}
        disabled={!canEdit}
        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        title={canEdit ? 'Editar' : 'Tu rol no puede editar tarifarios'}
      >
        <i className="ri-edit-line"></i>
      </button>
      <button
        onClick={() => onToggle(t)}
        disabled={!canEdit}
        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        title={!canEdit ? 'Tu rol no puede editar tarifarios' : t.active ? 'Desactivar' : 'Reactivar'}
      >
        <i className={t.active ? 'ri-forbid-line' : 'ri-refresh-line'}></i>
      </button>
      <button
        onClick={() => onDelete(t)}
        disabled={!canDelete}
        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        title={canDelete ? 'Eliminar' : 'Tu rol no puede eliminar tarifarios'}
      >
        <i className="ri-delete-bin-line"></i>
      </button>
    </>
  );
}
