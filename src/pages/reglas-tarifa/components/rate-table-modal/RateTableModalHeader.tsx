import type { RateTable } from '../../../../lib/tarifas/types';

/** Encabezado fijo del modal: "Nuevo tarifario" o "Editar <código>" y el botón de cierre. */
export function RateTableModalHeader({ table, onClose }: { table: RateTable | null; onClose: () => void }) {
  return (
    <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">
          {table ? `Editar ${table.code}` : 'Nuevo tarifario'}
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Una fila por combinación, en vez de una regla por combinación.
        </p>
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
        <i className="ri-close-line text-xl"></i>
      </button>
    </div>
  );
}
