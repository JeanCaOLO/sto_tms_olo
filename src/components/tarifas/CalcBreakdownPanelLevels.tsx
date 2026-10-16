import { Dispatch, SetStateAction } from 'react';

type Nivel = 'resumen' | 'detalle' | 'auditoria';

interface Props {
  nivel: Nivel;
  setNivel: Dispatch<SetStateAction<Nivel>>;
}

export function LevelSelector({ nivel, setNivel }: Props) {
  return (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
      {([
        ['resumen', 'Resumen'],
        ['detalle', 'Detalle'],
        ['auditoria', 'Auditoría'],
      ] as const).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setNivel(id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
            nivel === id ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
