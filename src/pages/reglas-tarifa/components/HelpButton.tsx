import { useState } from 'react';

interface HelpButtonProps {
  title: string;
  steps: string[];
}

// Botón "?" que despliega una lista de pasos de ayuda contextual — sin modal, se cierra con el
// mismo botón. Puerto adaptado de vista-tarifas-fase1/src/ui/HelpButton.tsx a los componentes
// base de este proyecto.
export default function HelpButton({ title, steps }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ayuda"
        className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
          open ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-300 text-slate-500 hover:bg-slate-50'
        }`}
      >
        ?
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-20 w-80 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-lg">
          <h4 className="mb-2 text-sm font-semibold text-slate-700">{title}</h4>
          <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-snug text-slate-600">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
