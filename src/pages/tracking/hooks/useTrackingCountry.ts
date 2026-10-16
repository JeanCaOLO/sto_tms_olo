import { useOperationalContext } from '../../../hooks/useOperationalContext';

/** Código ISO del país elegido en el selector global (barra superior); null con "Todos los países". */
export function useTrackingCountry(): string | null {
  const { countries, selectedCountryId } = useOperationalContext();
  return countries.find((c) => c.id === selectedCountryId)?.code ?? null;
}
