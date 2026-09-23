import { useState } from 'react';

interface ExtraAction {
  icon: string;
  title: string;
  onClick: () => void;
}

interface RowActionsProps {
  onEdit: () => void;
  onDelete: () => void;
  extra?: ExtraAction[];
  canDelete?: boolean;
}

const ICON_BUTTON = 'w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer';

// Editar / acciones extra / eliminar con confirmación en línea.
export default function RowActions({ onEdit, onDelete, extra = [], canDelete = true }: RowActionsProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button onClick={onDelete} className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer whitespace-nowrap">
          Confirmar
        </button>
        <button onClick={() => setConfirming(false)} className="px-3 py-1 text-xs bg-slate-200 text-slate-700 rounded hover:bg-slate-300 cursor-pointer whitespace-nowrap">
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <>
      <button onClick={onEdit} className={`${ICON_BUTTON} text-blue-600 hover:bg-blue-50`} title="Editar">
        <i className="ri-edit-line"></i>
      </button>
      {extra.map((action) => (
        <button key={action.title} onClick={action.onClick} className={`${ICON_BUTTON} text-slate-600 hover:bg-slate-100`} title={action.title}>
          <i className={action.icon}></i>
        </button>
      ))}
      {canDelete && (
        <button onClick={() => setConfirming(true)} className={`${ICON_BUTTON} text-red-600 hover:bg-red-50`} title="Eliminar">
          <i className="ri-delete-bin-line"></i>
        </button>
      )}
    </>
  );
}
