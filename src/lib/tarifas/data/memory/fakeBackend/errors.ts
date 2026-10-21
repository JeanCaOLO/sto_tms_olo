// Errores y respuestas del backend simulado (mismo formato que `tms_common.handler`: `{ data: null, error: { message, code? } }`).

import { ForeignKeyError, NotFoundError, UniqueViolationError } from '../../datasource';

export class HttpFail extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const failure = (error: HttpFail) =>
  json(error.status, { data: null, error: { message: error.message, ...(error.code ? { code: error.code } : {}) } });

/** Mismo formato que `tarifas_sql.new_id`: `<prefijo>_<ms en base 36>_<6 hex>`. */
export function newId(prefix: string): string {
  const random = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

/** Errores de integridad del almacén → HTTP, como `tms_common.pg._database_error` (SQLSTATE 23xxx → 409). */
export function translate(error: unknown): HttpFail {
  if (error instanceof HttpFail) return error;
  if (error instanceof UniqueViolationError) return new HttpFail(409, error.message, '23505');
  if (error instanceof ForeignKeyError) {
    return new HttpFail(409, error.message, /ya existe una fila con el id/.test(error.message) ? '23505' : '23503');
  }
  if (error instanceof NotFoundError) return new HttpFail(404, error.message);
  return new HttpFail(500, 'Error interno del servidor');
}
