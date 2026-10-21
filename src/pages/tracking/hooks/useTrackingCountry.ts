import { useOperationalContext } from '../../../hooks/useOperationalContext';

// La BD usa VN para Venezuela; el contexto mock (dev) usa VE. Los datos de prueba usan el de la BD.
const ALIAS: Record<string, string> = { VE: 'VN' };

/** Código ISO del país elegido en el selector global (barra superior); null con "Todos los países". */
export function useTrackingCountry(): string | null {
  const { countries, selectedCountryId } = useOperationalContext();
  const code = countries.find((c) => c.id === selectedCountryId)?.code;
  return code ? ALIAS[code] ?? code : null;
}
