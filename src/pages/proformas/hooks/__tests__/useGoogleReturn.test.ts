import { describe, expect, it } from 'vitest';
import { readReturnNotice } from '../useGoogleReturn';

describe('readReturnNotice', () => {
  it('no hay aviso sin el parámetro', () => {
    expect(readReturnNotice('')).toBeNull();
    expect(readReturnNotice('?otra=1')).toBeNull();
  });

  it('conexión exitosa', () => {
    expect(readReturnNotice('?google=connected')?.kind).toBe('ok');
  });

  it('error con el motivo que dio el servidor, o uno genérico', () => {
    expect(readReturnNotice('?google=error&reason=La%20conexi%C3%B3n%20venci%C3%B3')).toEqual({ kind: 'error', text: 'La conexión venció' });
    expect(readReturnNotice('?google=error')?.text).toMatch(/No se pudo conectar/);
  });
});
