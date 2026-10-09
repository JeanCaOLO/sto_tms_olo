const STEPS = [
  ['file', '1 · Archivo'],
  ['sheet', '2 · Hoja'],
  ['map', '3 · Columnas'],
  ['preview', '4 · Vista previa'],
] as const;

interface Props {
  structureName: string;
  step: (typeof STEPS)[number][0];
  onClose: () => void;
}

/** Título, botón de cierre y la barra con los cuatro pasos del asistente. */
export function WizardHeader({ structureName, step, onClose }: Props) {
  return (
    <>
      <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-10">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Importar planilla de costos</h2>
          <p className="text-xs text-slate-500 mt-0.5">Hacia «{structureName}»</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
          <i className="ri-close-line text-xl"></i>
        </button>
      </div>

      <div className="flex items-center gap-1 px-6 py-3 border-b border-slate-100 text-xs">
        {STEPS.map(([s, label]) => (
          <span
            key={s}
            className={`px-2.5 py-1 rounded-full ${step === s ? 'bg-teal-100 text-teal-800 font-medium' : 'text-slate-400'}`}
          >
            {label}
          </span>
        ))}
      </div>
    </>
  );
}
