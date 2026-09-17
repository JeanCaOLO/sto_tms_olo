import { getPais } from './eflow-api';

// OSRM self-hosted por país (Dokploy). CR y VE son grafos SEPARADOS: un punto de
// Venezuela sobre el grafo de CR hace snap a ~1.600 km, así que hay que elegir la
// instancia según el país activo. Override por env (VITE_OSRM_URL_CR /
// VITE_OSRM_URL_VE) para apuntar a otra instancia sin recompilar la lógica.
const OSRM_CR = (import.meta.env.VITE_OSRM_URL_CR || 'https://osrm.jesusaraujo.lat').replace(/\/$/, '');
const OSRM_VE = (import.meta.env.VITE_OSRM_URL_VE || 'https://osrm-ve.jesusaraujo.lat').replace(/\/$/, '');

// Base de OSRM para el país activo (el país lo lee eflow-api de su estado de módulo).
export function osrmBaseUrl(): string {
  return getPais() === 've' ? OSRM_VE : OSRM_CR;
}
