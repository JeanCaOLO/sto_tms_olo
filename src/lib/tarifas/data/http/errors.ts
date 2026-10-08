// Manejo de errores en HttpDataSource.

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
