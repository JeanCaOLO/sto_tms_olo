// Backend simulado del tarifador, para el modo mock (y para probar el cliente HTTP sin red).
//
// Es un `fetch` que contesta el mismo contrato que `backend/tarifas/src/app.py` (ver el encabezado de
// `http-datasource.ts`), con los datos del almacén en memoria. La idea: en modo mock la app usa el
// `HttpDataSource` VERDADERO, así que sus caminos (transacciones que devuelven lo enviado, `/find`, `/batch`,
// mapeo de 404/405/409, reintentos) se ejercitan igual que con Aurora, y un error de contrato aparece en
// el mock y no recién al conectar el túnel.
//
// Qué replica del backend (y de dónde sale cada regla):
//   - Lista blanca de tablas y columnas desde `generateManifest()`, el mismo registro que genera el
//     `schema_manifest.json` del backend. Columna desconocida → 400 (`tarifas_schema.Table.column_type`).
//   - Entidades externas: solo lectura (405). Bitácora: solo agregar (405).
//   - Permisos por módulo: `tarifas` (liquidar) y `tarifas.config` (configurar) → 403.
//   - Valores: se validan los tipos que Postgres castearía (uuid, integer, numeric, boolean, fecha) y las
//     columnas NOT NULL que el INSERT no trae. Violaciones de integridad → 409 con SQLSTATE (23502/23503/23505).
//   - Respuestas: `numeric` vuelve como texto (`decimal_as=str` de `tms_common.responses`), fechas en ISO.
//   - Una transacción (`/tx`) valida todo antes de ejecutar y es todo-o-nada; una fila inexistente → 404.
//   - Topes: 5.000 filas por consulta, 25 consultas por `/batch`.
//
// Lo que NO replica: filtro por países del rol, orden con la colación de la base, restricciones CHECK.

import type { Row } from '../../datasource';
import type { EntityName } from '../../schema';
import { MemoryDataSource } from '../driver';
import { failure, HttpFail, json, translate } from './errors';
import { permissionsFor, type MockRole } from './permissions';
import { checkValues, outbound, table, validateQuery, type Table } from './schema';

export type { MockRole } from './permissions';

export interface FakeBackendOptions {
  /** Rol de quien llama. Se evalúa en cada request (el selector de pruebas lo cambia en caliente). */
  role?: () => MockRole;
  /** Espera simulada por request, en ms. */
  latencyMs?: number;
  /** Se llama con cada escritura que llega (antes de validarla), con la forma que repite `herramientas/replay_payloads.py`. */
  onWrite?: (op: WriteOp) => void;
}

export interface WriteOp {
  op: 'insert' | 'update' | 'delete';
  table: string;
  id?: string;
  values?: unknown;
}

const MAX_BATCH = 25;

export function createFakeBackend(options: FakeBackendOptions = {}): typeof fetch {
  const { reader, writer } = permissionsFor(options.role ?? (() => 'admin'));
  const store = () => new MemoryDataSource();

  const find = async (t: Table, q: unknown): Promise<Row[]> => {
    const rows = await store().find(t.entity as EntityName, validateQuery(t, q));
    return rows.map((row) => outbound(t, row));
  };

  const parseQ = (raw: string | null): unknown => {
    if (!raw) return undefined;
    try { return JSON.parse(raw); } catch { throw new HttpFail(400, 'El parámetro "q" no es JSON válido'); }
  };

  // ── Escrituras sueltas ───────────────────────────────────────────────────────────────────────
  const insertRow = async (t: Table, body: unknown) => {
    writer(t, 'insert');
    const row = checkValues(t, body, true);
    return outbound(t, await store().insert(t.entity as EntityName, row));
  };

  const updateRow = async (t: Table, id: string, body: unknown) => {
    writer(t, 'update');
    const values = checkValues(t, body, false);
    delete values[t.primaryKey];
    if (Object.keys(values).length === 0) throw new HttpFail(400, 'update requiere al menos un campo además del id');
    if (!(await store().findOne(t.entity as EntityName, id))) throw new HttpFail(404, `${t.label} no encontrado.`);
    return outbound(t, await store().update(t.entity as EntityName, id, values));
  };

  const deleteRow = async (t: Table, id: string) => {
    writer(t, 'delete');
    if (!(await store().findOne(t.entity as EntityName, id))) throw new HttpFail(404, `${t.label} no encontrado.`);
    await store().delete(t.entity as EntityName, id);
  };

  // ── Transacción ──────────────────────────────────────────────────────────────────────────────
  const transaction = async (body: unknown) => {
    const ops = (body as { ops?: unknown })?.ops;
    if (!Array.isArray(ops) || ops.length === 0) throw new HttpFail(400, '"ops" debe ser una lista no vacía');
    // Todo se valida antes de abrir la transacción (`app._planned`).
    const planned = ops.map((raw) => {
      const op = raw as { op?: string; table?: string; id?: string; values?: unknown };
      if (!op || !['insert', 'update', 'delete'].includes(String(op.op))) {
        throw new HttpFail(400, 'Cada operación debe ser { op: "insert" | "update" | "delete", table, id?, values? }');
      }
      const kind = op.op as 'insert' | 'update' | 'delete';
      const t = table(String(op.table));
      writer(t, kind);
      if (kind === 'insert') return { kind, t, row: checkValues(t, op.values, true) };
      if (!op.id) throw new HttpFail(400, `La operación "${kind}" requiere "id"`);
      if (kind === 'update') {
        const values = checkValues(t, op.values, false);
        delete values[t.primaryKey];
        if (Object.keys(values).length === 0) throw new HttpFail(400, 'update requiere al menos un campo además del id');
        return { kind, t, id: op.id, values };
      }
      return { kind, t, id: op.id };
    });

    try {
      return await store().transaction(async (tx) => {
        const results: unknown[] = [];
        for (const step of planned) {
          const entity = step.t.entity as EntityName;
          if (step.kind === 'insert') {
            results.push(outbound(step.t, await tx.insert(entity, step.row)));
          } else if (!(await tx.findOne(entity, step.id as string))) {
            throw new HttpFail(404, 'Una de las filas de la transacción no existe: no se guardó nada.');
          } else if (step.kind === 'update') {
            results.push(outbound(step.t, await tx.update(entity, step.id as string, step.values as Row)));
          } else {
            await tx.delete(entity, step.id as string);
            results.push(null);
          }
        }
        return results;
      });
    } catch (error) {
      throw translate(error);
    }
  };

  // ── Despacho ─────────────────────────────────────────────────────────────────────────────────
  const route = async (method: string, url: URL, bodyText: string | undefined): Promise<Response> => {
    const marker = '/tarifas/';
    const at = url.pathname.indexOf(marker);
    if (at === -1) throw new HttpFail(404, `Ruta no soportada: ${method} ${url.pathname}`);
    const parts = url.pathname.slice(at + marker.length).split('/').filter(Boolean).map(decodeURIComponent);
    const body = (): unknown => {
      try { return bodyText ? JSON.parse(bodyText) : undefined; } catch { throw new HttpFail(400, 'El body debe ser un objeto JSON'); }
    };

    if (method === 'POST' && parts.length === 1 && parts[0] === 'tx') {
      return json(200, await transaction(body()));
    }
    if (method === 'POST' && parts.length === 1 && parts[0] === 'batch') {
      reader();
      const queries = (body() as { queries?: unknown })?.queries;
      if (!Array.isArray(queries) || queries.length === 0) throw new HttpFail(400, '"queries" debe ser una lista no vacía de { table, q }');
      if (queries.length > MAX_BATCH) throw new HttpFail(400, `"queries" admite hasta ${MAX_BATCH} consultas por llamada`);
      const planned = queries.map((item) => {
        if (!item || typeof item !== 'object') throw new HttpFail(400, 'Cada consulta debe ser un objeto { table, q }');
        const t = table(String((item as { table?: unknown }).table));
        validateQuery(t, (item as { q?: unknown }).q);
        return { t, q: (item as { q?: unknown }).q };
      });
      return json(200, await Promise.all(planned.map(({ t, q }) => find(t, q))));
    }
    if (method === 'POST' && parts.length === 2 && parts[1] === 'find') {
      reader();
      return json(200, await find(table(parts[0]), body()));
    }
    if (method === 'GET' && parts.length === 1) {
      reader();
      return json(200, await find(table(parts[0]), parseQ(url.searchParams.get('q'))));
    }
    if (method === 'GET' && parts.length === 2) {
      reader();
      const t = table(parts[0]);
      const row = await store().findOne(t.entity as EntityName, parts[1]);
      if (!row) throw new HttpFail(404, `${t.label} no encontrado.`);
      return json(200, outbound(t, row));
    }
    if (method === 'POST' && parts.length === 1) return json(200, await insertRow(table(parts[0]), body()));
    if (method === 'PATCH' && parts.length === 2) return json(200, await updateRow(table(parts[0]), parts[1], body()));
    if (method === 'DELETE' && parts.length === 2) {
      await deleteRow(table(parts[0]), parts[1]);
      return new Response(null, { status: 204 });
    }
    throw new HttpFail(404, `Ruta no soportada: ${method} ${url.pathname}`);
  };

  /** Las escrituras de una request, tal como las ve el backend (una por operación de `/tx`). */
  const reportWrites = (method: string, url: URL, bodyText: string | undefined) => {
    if (!options.onWrite || method === 'GET') return;
    const parts = url.pathname.split('/tarifas/')[1]?.split('/').filter(Boolean).map(decodeURIComponent) ?? [];
    try {
      const body = bodyText ? JSON.parse(bodyText) : undefined;
      if (method === 'POST' && parts[0] === 'tx') {
        for (const op of (body?.ops ?? []) as WriteOp[]) options.onWrite(op);
      } else if (method === 'POST' && parts.length === 1 && parts[0] !== 'batch') {
        options.onWrite({ op: 'insert', table: parts[0], values: body });
      } else if (method === 'PATCH' && parts.length === 2) {
        options.onWrite({ op: 'update', table: parts[0], id: parts[1], values: body });
      } else if (method === 'DELETE' && parts.length === 2) {
        options.onWrite({ op: 'delete', table: parts[0], id: parts[1] });
      }
    } catch {
      // Un body ilegible lo rechaza `route` con 400.
    }
  };

  return async (input, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://mock.local');
    if (options.latencyMs) await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    reportWrites(method, url, typeof init?.body === 'string' ? init.body : undefined);
    try {
      return await route(method, url, typeof init?.body === 'string' ? init.body : undefined);
    } catch (error) {
      return failure(translate(error));
    }
  };
}
