// Vista simple / extendida del liquidador.
//
// Quien solo liquida viajes ve lo mínimo: variables, total y emitir. Quien configura el tarifador
// (permiso `tarifas.config`) además puede ver todo el desglose y elegir entre ambas vistas; la
// elección se recuerda en el navegador. Por defecto se ve la simple.

import { useState } from 'react';
import { usePermissions } from '../../../hooks/usePermissions';

const STORAGE_KEY = 'liquidador.vista';

const leerPreferencia = (): 'simple' | 'extendida' => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'extendida' ? 'extendida' : 'simple';
  } catch {
    return 'simple';
  }
};

export function useVistaLiquidador() {
  const { can } = usePermissions();
  // `can` ya devuelve true para el administrador.
  const puedeConfigurar = can('tarifas.config', 'view');
  const [preferencia, setPreferencia] = useState<'simple' | 'extendida'>(leerPreferencia);

  const setExtendida = (valor: boolean) => {
    const nueva = valor ? 'extendida' : 'simple';
    setPreferencia(nueva);
    try {
      localStorage.setItem(STORAGE_KEY, nueva);
    } catch {
      // Sin almacenamiento disponible: la elección vale solo para esta sesión.
    }
  };

  return {
    puedeConfigurar,
    extendida: puedeConfigurar && preferencia === 'extendida',
    setExtendida,
  };
}

/** Interruptor "Vista simple / extendida" (solo se muestra a quien puede configurar). */
export function InterruptorVista({ extendida, onChange }: { extendida: boolean; onChange: (v: boolean) => void }) {
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
