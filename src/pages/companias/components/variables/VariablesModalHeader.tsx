interface Props {
  partyName: string;
  onClose: () => void;
}

/** Encabezado fijo del modal: título con el nombre de la compañía y botón de cierre. */
export function VariablesModalHeader({ partyName, onClose }: Props) {
  return (
    <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Variables de {partyName}</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Campos propios de esta compañía, disponibles en sus reglas de liquidación.
        </p>
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
        <i className="ri-close-line text-xl"></i>
      </button>
    </div>
  );
}
