// Valores por defecto que se reponen cuando cambia el catálogo: variables de la compañía y zonas.

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { initialCustomVarValues } from '../../../../lib/tarifas/customVarFields';
import type { CustomVarField } from '../../../../lib/tarifas/customVarFields';
import type { Zone } from '../../../../lib/tarifas/types';
import type { ViajeLibre } from './testerTypes';

interface Params {
  customFields: CustomVarField[];
  zones: Zone[];
  pendientes: MutableRefObject<Record<string, string> | null>;
  setCustomRaw: (raw: Record<string, string>) => void;
  setLibre: Dispatch<SetStateAction<ViajeLibre>>;
}

export function useTesterDefaults({ customFields, zones, pendientes, setCustomRaw, setLibre }: Params) {
  useEffect(() => {
    const base = initialCustomVarValues(customFields);
    if (pendientes.current) {
      for (const key of Object.keys(base)) {
        const traido = pendientes.current[key];
        if (traido !== undefined) base[key] = traido;
      }
      pendientes.current = null;
    }
    setCustomRaw(base);
  }, [customFields, pendientes, setCustomRaw]);

  // Zonas por defecto para el modo libre: sin ellas, toda regla por zona queda muda.
  useEffect(() => {
    if (zones.length === 0) return;
    setLibre((prev) => (prev.originZoneId
      ? prev
      : { ...prev, originZoneId: zones[0].id, destZoneId: zones[1]?.id ?? zones[0].id }));
  }, [zones, setLibre]);
}
