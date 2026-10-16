// El catálogo del motor para el país (y la compañía) elegidos, y los campos propios que declara.

import { useEffect, useMemo, useState } from 'react';
import { CatalogError, loadTarifasCatalog, type TarifasCatalog } from '../../../../lib/tarifas/catalogLoader';
import { buildCustomVarFields, constantVars } from '../../../../lib/tarifas/customVarFields';
import type { Zone } from '../../../../lib/tarifas/types';
import { mensajeDe } from './testerTypes';

export function useTesterCatalog(countryId: string, partyId: string | null) {
  const [catalog, setCatalog] = useState<TarifasCatalog | null>(null);
  const [catalogError, setCatalogError] = useState('');

  useEffect(() => {
    if (!countryId) { setCatalog(null); return; }
    let vigente = true;
    setCatalogError('');
    void loadTarifasCatalog(countryId, partyId)
      .then((c) => { if (vigente) setCatalog(c); })
      .catch((e) => {
        if (!vigente) return;
        setCatalog(null);
        setCatalogError(e instanceof CatalogError ? e.message : mensajeDe(e, 'No se pudo cargar el catálogo del país.'));
      });
    return () => { vigente = false; };
  }, [countryId, partyId]);

  // Estable entre renders: si fuera un `??` suelto, sería un arreglo nuevo cada vez y el efecto
  // que elige las zonas por defecto se dispararía sin parar.
  const zones: Zone[] = useMemo(() => catalog?.zones ?? [], [catalog]);

  const customFields = useMemo(() => buildCustomVarFields(catalog?.partyVariables ?? []), [catalog]);
  const constantes = useMemo(() => constantVars(catalog?.partyVariables ?? []), [catalog]);

  return { catalog, catalogError, zones, customFields, constantes };
}
