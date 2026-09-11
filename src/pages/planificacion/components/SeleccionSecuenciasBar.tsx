import { ESTADOS_SECUENCIA, type EstadoSecuencia } from '../route-status';

interface Props {
  seleccionadas: number;
  todasSeleccionadas: boolean;
  onToggleTodas: () => void;
  onAplicarEstado: (estado: EstadoSecuencia) => void;
  onEliminar: () => void;
}

// Barra de selección múltiple para "Secuencias Generadas": seleccionar todo +
// acciones en lote (cambiar estado / eliminar) sobre lo seleccionado.
export default function SeleccionSecuenciasBar({
  seleccionadas, todasSeleccionadas, onToggleTodas, onAplicarEstado, onEliminar,
}: Props) {
  const hay = seleccionadas > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <button
        type="button"
        onClick={onToggleTodas}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer"
      >
        <span
          className={`w-5 h-5 flex items-center justify-center rounded-md border transition-colors ${
            todasSeleccionadas
              ? 'bg-teal-600 border-teal-600 text-white'
              : hay
                ? 'bg-teal-100 border-teal-400 text-teal-700'
                : 'bg-white border-slate-300 text-transparent'
          }`}
        >
          <i className={todasSeleccionadas ? 'ri-check-line text-sm' : 'ri-subtract-line text-sm'}></i>
        </span>
        {todasSeleccionadas ? 'Deseleccionar todo' : 'Seleccionar todo'}
      </button>

      <span aria-live="polite" className="text-sm text-slate-500">
        {hay ? `${seleccionadas} seleccionada(s)` : 'Clic en una secuencia para seleccionarla'}
      </span>

      {hay && (
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          {ESTADOS_SECUENCIA.map((e) => (
            <button
              key={e.estado}
              type="button"
              onClick={() => onAplicarEstado(e.estado)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              <i className={e.icon}></i>{e.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onEliminar}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 cursor-pointer"
          >
            <i className="ri-delete-bin-line"></i>Eliminar
          </button>
        </div>
      )}
    </div>
  );
}
