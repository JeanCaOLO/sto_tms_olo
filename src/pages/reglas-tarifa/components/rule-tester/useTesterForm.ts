import { useRef, useState } from 'react';
import { diaInicial, viajeLibreInicial, type DatosDelDia, type Modo, type ViajeLibre } from './testerTypes';

/** Lo que la persona elige y teclea en el Probador. */
export function useTesterForm() {
  const [modo, setModo] = useState<Modo>('viaje');
  const [countryId, setCountryId] = useState('');
  const [tripId, setTripId] = useState('');
  /** Perfil del transportista del viaje elegido: lo informa el último cálculo. */
  const [viajePartyId, setViajePartyId] = useState<string | null>(null);
  const [libre, setLibre] = useState<ViajeLibre>(viajeLibreInicial);
  const [dia, setDia] = useState<DatosDelDia>(diaInicial);
  const [customRaw, setCustomRaw] = useState<Record<string, string>>({});
  const [escenarioId, setEscenarioId] = useState('');

  // Valores de variables que trae una plantilla y que hay que reponer DESPUÉS de que se regeneren
  // los campos de la compañía. Sin esto, aplicar un escenario cargaba sus variables y el efecto que
  // reinicia los campos las pisaba con el valor por defecto un instante después.
  const pendientes = useRef<Record<string, string> | null>(null);

  return {
    modo, setModo, countryId, setCountryId, tripId, setTripId, viajePartyId, setViajePartyId,
    libre, setLibre, dia, setDia, customRaw, setCustomRaw, escenarioId, setEscenarioId, pendientes,
  };
}

export type TesterForm = ReturnType<typeof useTesterForm>;
