// Punto de entrada de la capa de datos del tarifador.
//
// EL CAMBIO A POSTGRES, COMPLETO:
//
//   1. Correr el DDL generado (`sql/04_tarifas.sql`) en la base.
//   2. Levantar la API que cumple el contrato de `http-datasource.ts`, con las credenciales de
//      Postgres en SU entorno (nunca en el frontend).
//   3. En el `.env` del frontend:
//        VITE_TARIFAS_DATASOURCE=postgres
//        VITE_TARIFAS_API_URL=https://…
//
// Nada más. Ni la UI ni el kernel se enteran de dónde vienen los datos.

import type { DataSource } from './datasource';
import { HttpDataSource } from './http-datasource';
import { JsonDataSource } from './json-datasource';

export * from './datasource';
export * from './schema';
export { JsonDataSource } from './json-datasource';
export { HttpDataSource } from './http-datasource';
export { generateDdl } from './ddl';

// `import.meta.env` solo existe bajo Vite; en vitest/node se cae a los valores por defecto, que es
// justo lo que los tests quieren (driver JSON, sin red).
function env(key: string): string | undefined {
  try {
    return (import.meta as unknown as { env?: Record<string, string> }).env?.[key];
  } catch {
    return undefined;
  }
}

function build(): DataSource {
  const kind = (env('VITE_TARIFAS_DATASOURCE') ?? 'json').toLowerCase();

  if (kind === 'json') return new JsonDataSource();

  if (kind === 'postgres' || kind === 'http') {
    const baseUrl = env('VITE_TARIFAS_API_URL');
    if (!baseUrl) {
      throw new Error(
        'VITE_TARIFAS_DATASOURCE=postgres requiere VITE_TARIFAS_API_URL (URL base de la API del ' +
          'tarifador). Configurala en el .env del frontend, o volvé a VITE_TARIFAS_DATASOURCE=json.',
      );
    }
    return new HttpDataSource({ baseUrl });
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
