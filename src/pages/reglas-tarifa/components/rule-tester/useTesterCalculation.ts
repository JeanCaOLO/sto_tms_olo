// El cálculo del Probador: viaje real (calculateTrip) o viaje libre (catálogo + calculate).

import { useEffect, useState } from 'react';
import type { TarifasCatalog } from '../../../../lib/tarifas/catalogLoader';
import { parseCustomVarValues, type CustomVarField } from '../../../../lib/tarifas/customVarFields';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';
import type { TripRecord } from '../../../../lib/tarifas/types';
import { buildFreeTrip, calculateFreeTrip } from './buildFreeTrip';
import { runTripCalculation } from './runTripCalculation';
import { mensajeDe, type Calculo, type DatosDelDia, type Modo, type ViajeLibre } from './testerTypes';

interface Params {
  modo: Modo;
  trip: TripRecord | null;
  libre: ViajeLibre;
  libreCarrier: CarrierProfile | null;
  dia: DatosDelDia;
  customFields: CustomVarField[];
  customRaw: Record<string, string>;
  catalog: TarifasCatalog | null;
  countryId: string;
  setViajePartyId: (update: (prev: string | null) => string | null) => void;
  setError: (message: string) => void;
}

export function useTesterCalculation(p: Params) {
  const [calculo, setCalculo] = useState<Calculo | null>(null);
  const [calculando, setCalculando] = useState(false);
  const { modo, trip, libre, libreCarrier, dia, customFields, customRaw, catalog, countryId, setError, setViajePartyId } = p;

  useEffect(() => {
    let vigente = true;

    const terminar = (c: Calculo | null, mensaje = '') => {
      if (!vigente) return;
      setCalculo(c);
      setError(mensaje);
      setCalculando(false);
    };

    const { values, errors } = parseCustomVarValues(customFields, customRaw);
    if (Object.keys(errors).length > 0) { terminar(null, Object.values(errors).join(' ')); return undefined; }

    if (modo === 'viaje') {
      if (!trip) { terminar(null); return undefined; }
      setCalculando(true);
      runTripCalculation(trip, values, () => vigente, terminar, (id) => setViajePartyId((prev) => (prev === id ? prev : id)));
      return () => { vigente = false; };
    }

    // Viaje libre: se necesita el catálogo del país.
    if (!catalog) { terminar(null); return undefined; }
    // Una fecha vacía o ilegible haría lanzar a toISOString(): se avisa en vez de romper el cálculo.
    if (Number.isNaN(new Date(dia.quotedAt).getTime())) { terminar(null, 'La fecha del viaje no es válida.'); return undefined; }
    try {
      terminar(calculateFreeTrip(catalog, buildFreeTrip(libre, dia, libreCarrier, countryId, values)));
    } catch (err) {
      console.error('Error en el probador del motor:', err);
      terminar(null, mensajeDe(err, 'No se pudo evaluar. Revisá el JSON de condiciones o expresiones en modo avanzado.'));
    }
    return () => { vigente = false; };
  }, [modo, trip, libre, libreCarrier, dia, customFields, customRaw, catalog, countryId, setError, setViajePartyId]);

  return { calculo, calculando };
}
