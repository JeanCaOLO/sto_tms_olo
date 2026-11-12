// Vista de demostración del tarifador («Ver como»): quién puede configurar lo ve como lo vería un Liquidador.
// Solo cambia lo que se muestra; el backend usa los permisos reales. En modo mock, el backend simulado
// también la sigue (ver `installMock.ts`), así que «Liquidador» recibe 403 al escribir configuración.

export type ViewAs = 'desarrollador' | 'liquidador';

export const PREVIEW_KEY = 'tarifador.viewAs';

export function readViewAs(): ViewAs {
  try {
    return sessionStorage.getItem(PREVIEW_KEY) === 'liquidador' ? 'liquidador' : 'desarrollador';
  } catch {
    return 'desarrollador';
  }
}
