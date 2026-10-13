// Toggle button for simple/extended view.

interface Props {
  extendida: boolean;
  onChange: (v: boolean) => void;
}

export function InterruptorVista({ extendida, onChange }: Props) {
  return (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit" role="group" aria-label="Tipo de vista">
      {([[false, 'Vista simple'], [true, 'Vista extendida']] as const).map(([valor, label]) => (
        <button
          key={label}
          type="button"
          onClick={() => onChange(valor)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
            extendida === valor ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
