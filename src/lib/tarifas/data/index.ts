// Punto de entrada de la capa de datos del tarifador.
//
// EL CAMBIO A AURORA, COMPLETO:
//
//   1. Correr la migración `sql/19_tarifas_aurora.sql` (tablas `tarifas_*` + vistas).
//   2. Desplegar `backend/tarifas/` (cumple el contrato de `http-datasource.ts`).
//   3. En el `.env` del frontend:
//        VITE_TARIFAS_DATASOURCE=postgres
//        VITE_TARIFAS_API_URL=…            (opcional; por defecto `${VITE_API_BASE}/api`)
//
// Nada más. Ni la UI ni el kernel se enteran de dónde vienen los datos.

import type { DataSource } from './datasource';
import { HttpDataSource } from './http-datasource';
import { JsonDataSource } from './json-datasource';

export * from './datasource';
export * from './schema';
export { JsonDataSource } from './json-datasource';
export { HttpDataSource, ApiError, resetHttpFeatureFlags } from './http-datasource';
export { onDataWrite, notifyWrite } from './writeEvents';
export { generateDdl } from './ddl';
export { generateManifest } from './manifest';

// `import.meta.env` solo existe bajo Vite; en vitest/node se cae a los valores por defecto, que es
// justo lo que los tests quieren (driver JSON, sin red).
function env(key: string): string | undefined {
  try {
    return (import.meta as unknown as { env?: Record<string, string> }).env?.[key];
  } catch {
    return undefined;
  }
}

// El JWT del usuario logueado. Se lee de la misma clave que usa el cliente del TMS
// (`src/lib/supabase.ts`, STORAGE_KEY = 'tms_session') en cada request, no una sola vez: así un
// re-login no deja al tarifador con un token vencido.
function sessionHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('tms_session');
    const token = raw ? (JSON.parse(raw) as { access_token?: string }).access_token : undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function build(): DataSource {
  const kind = (env('VITE_TARIFAS_DATASOURCE') ?? 'json').toLowerCase();

  if (kind === 'json') return new JsonDataSource();

  if (kind === 'postgres' || kind === 'http') {
    // Misma API que el resto del TMS: vacío en dev (Vite proxya /api), el API Gateway en build.
    const baseUrl =
      env('VITE_TARIFAS_API_URL') ?? `${(env('VITE_API_BASE') ?? '').replace(/\/$/, '')}/api`;
    return new HttpDataSource({ baseUrl, headers: sessionHeaders });
  }

  throw new Error(
    `VITE_TARIFAS_DATASOURCE="${kind}" no es un driver conocido. Valores válidos: "json" o "postgres".`,
  );
}

let instance: DataSource | null = null;

/** Driver activo del módulo. Se construye una sola vez por sesión. */
export function db(): DataSource {
  if (!instance) instance = build();
  return instance;
}

/** Solo para tests: fuerza un driver concreto (o vuelve a resolverlo desde el entorno con null). */
export function setDataSource(dataSource: DataSource | null): void {
  instance = dataSource;
}
export {
  getTarifasMetrics, resetTarifasMetrics, diffMetrics, recordCatalog, type TarifasMetrics,
} from './metrics';
