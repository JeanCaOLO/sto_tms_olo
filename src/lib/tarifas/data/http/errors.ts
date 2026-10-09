// Manejo de errores en HttpDataSource.

import { ForeignKeyError, UniqueViolationError } from '../datasource';

/**
 * Lee el error de la API. El backend (`tms_handler`) responde `{ data: null, error: { message, code? } }`;
 * se aceptan también `{ error: "texto", code }` y `{ detail }` por compatibilidad.
 */
export async function readError(response: Response, fallback: string): Promise<{ message: string; code?: string }> {
  try {
    const body = (await response.json()) as {
      detail?: string;
      code?: string;
      error?: string | { message?: string; code?: string } | null;
    };
    const error = body.error;
    const message = typeof error === 'string' ? error : error?.message ?? body.detail ?? fallback;
    const code = (typeof error === 'object' && error ? error.code : undefined) ?? body.code;
    return { message, ...(code ? { code } : {}) };
  } catch {
    return { message: fallback };
  }
}

/** Falla de la API con su estado HTTP, para que el llamador pueda decidir (p. ej. 404 de una ruta nueva). */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Funciones nuevas del backend que quizá todavía no estén desplegadas, por API. Una vez que responde
 * 404, no se vuelve a intentar en esta sesión.
 */
const unsupported = new Set<string>();

export const isUnsupported = (flag: string): boolean => unsupported.has(flag);
export const markUnsupported = (flag: string): void => { unsupported.add(flag); };

/** Solo para tests. */
export function resetHttpFeatureFlags(): void {
  unsupported.clear();
}

/**
 * Lanza el error de una transacción rechazada. Mismo mapeo que una escritura suelta: la UI distingue
 * "en uso" de "duplicado".
 */
export async function throwTransactionError(response: Response): Promise<never> {
  const { message: detalle, code } = await readError(response, `La API respondió ${response.status}`);
  const message = `${detalle} No se guardó nada.`;
  if (response.status === 409) {
    throw code === '23505' ? new UniqueViolationError(message) : new ForeignKeyError(message);
  }
  throw new Error(`La transacción falló: ${message}`);
}
