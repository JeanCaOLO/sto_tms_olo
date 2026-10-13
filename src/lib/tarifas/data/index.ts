// Punto de entrada de la capa de datos del tarifador.
//
// EL CAMBIO A AURORA, COMPLETO:
//
//   1. Correr la migración `sql/19_tarifas_aurora.sql` (tablas `tarifas_*` + vistas).
//   2. Desplegar `backend/tarifas/` (cumple el contrato de `http-datasource.ts`).
//   3. Opcional, en el `.env` del frontend:
//        VITE_TARIFAS_API_URL=…            (por defecto `${VITE_API_BASE}/api`)
//
// La fuente es SIEMPRE el backend (`HttpDataSource`): no hay variable para cambiarla ni datos de
// prueba en la app. Las pruebas inyectan un almacén en memoria con `setDataSource`
// (`__tests__/helpers/memory`).

import { STORAGE_KEY } from '../../supabase';
import type { DataSource } from './datasource';
import { HttpDataSource } from './http-datasource';

export * from './datasource';
export * from './schema';
export { HttpDataSource, ApiError, resetHttpFeatureFlags } from './http-datasource';
export { onDataWrite, notifyWrite } from './writeEvents';
export { generateDdl } from './ddl';
export { generateManifest } from './manifest';

// `import.meta.env` solo existe bajo Vite; en vitest/node se cae a los valores por defecto.
function env(key: string): string | undefined {
  try {
    return (import.meta as unknown as { env?: Record<string, string> }).env?.[key];
  } catch {
    return undefined;
  }
}

// El JWT del usuario logueado. Se lee de la misma clave que usa el cliente del TMS
// en cada request, no una sola vez: así un re-login no deja al tarifador con un token vencido.
function sessionHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const token = raw ? (JSON.parse(raw) as { access_token?: string }).access_token : undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function build(): DataSource {
  // Misma API que el resto del TMS: vacío en dev (Vite proxya /api), el API Gateway en build.
  const baseUrl =
    env('VITE_TARIFAS_API_URL') ?? `${(env('VITE_API_BASE') ?? '').replace(/\/$/, '')}/api`;
  return new HttpDataSource({ baseUrl, headers: sessionHeaders });
}

let instance: DataSource | null = null;

/** Driver activo del módulo. Se construye una sola vez por sesión. */
export function db(): DataSource {
  if (!instance) instance = build();
  return instance;
}

/** Solo para tests: fuerza un almacén concreto (o vuelve al backend con null). */
export function setDataSource(dataSource: DataSource | null): void {
  instance = dataSource;
}
export {
  getTarifasMetrics, resetTarifasMetrics, diffMetrics, recordCatalog, type TarifasMetrics,
} from './metrics';
