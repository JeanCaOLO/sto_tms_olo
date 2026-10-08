// Hook for simple/extended view preference in the settlements module.

import { useState } from 'react';
import { usePermissions } from '../../../hooks/usePermissions';

const STORAGE_KEY = 'liquidador.vista';

const readPreference = (): 'simple' | 'extendida' => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'extendida' ? 'extendida' : 'simple';
  } catch {
    return 'simple';
  }
};

export function useLiquidadorVista() {
  const { can } = usePermissions();
  // Ver la configuración (solo lectura) no da la vista extendida: hace falta poder editarla.
  const puedeConfigurar = can('tarifas.config', 'edit');
  const [preferencia, setPreferencia] = useState<'simple' | 'extendida'>(readPreference);

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
