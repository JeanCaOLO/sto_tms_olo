// Modo mock del tarifador (solo desarrollo, sin túnel a Aurora): el driver HTTP VERDADERO habla con un
// backend simulado (`fakeBackend.ts`) que guarda en memoria, cargado con la semilla demo. Lo importa
// `main.tsx` únicamente cuando `MOCK_AUTH_ENABLED` (que exige `import.meta.env.DEV`), así que no entra a
// un build desplegado.
//
// Lo que se edite persiste en `localStorage`; `window.__tarifasMockReset()` vuelve a la semilla.
// Rol de las pruebas de permisos: ver `getMockRole` en `lib/mock-auth.ts`.
// `window.__tarifasOpLog` junta las escrituras que hizo la app: se guardan con JSON.stringify(window.__tarifasOpLog)
// y se pasan por `docs/tarifador/cambios_hechos_para_probar_backend/herramientas/replay_payloads.py`.

import demoSeed from './seed.demo.json';
import { setDataSource } from '../index';
import { HttpDataSource } from '../http-datasource';
import { invalidateCatalogCache } from '../../catalogLoader';
import { getMockRole } from '../../../mock-auth';
import { createFakeBackend, type WriteOp } from './fakeBackend';
import { enablePersistence, resetToSeed, setSeed } from './store';

/** Clave de `localStorage`. Subir el número cuando cambie la forma de la semilla. */
export const MOCK_STORAGE_KEY = 'tarifas-mock:v2';

setSeed(demoSeed);
enablePersistence(MOCK_STORAGE_KEY);
setDataSource(new HttpDataSource({
  baseUrl: 'http://mock.local/api',
  fetchImpl: createFakeBackend({
    role: getMockRole,
    latencyMs: 40,
    // Registro de las escrituras para repetirlas contra el backend real: `window.__tarifasOpLog`.
    onWrite: (op) => { (window.__tarifasOpLog ??= []).push(op); },
  }),
  // Sin reintentos: un fallo del backend simulado es un fallo de contrato, no de red.
  retries: 0,
}));

declare global {
  interface Window {
    __tarifasMockReset?: () => void;
    __tarifasOpLog?: WriteOp[];
  }
}

window.__tarifasMockReset = () => {
  resetToSeed();
  invalidateCatalogCache();
  console.info('[tarifas-mock] datos restaurados a la semilla demo');
};

console.info('[tarifas-mock] tarifador contra un backend simulado en memoria (sin red). Reset: __tarifasMockReset()');
