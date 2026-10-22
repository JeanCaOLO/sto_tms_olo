import { useEffect, useState } from 'react';

export interface ReturnNotice {
  kind: 'ok' | 'error';
  text: string;
}

/** Lee el resultado de volver de Google (`?google=connected` o `?google=error&reason=…`). Sin efectos al leer. */
export function readReturnNotice(search: string): ReturnNotice | null {
  const params = new URLSearchParams(search);
  const result = params.get('google');
  if (!result) return null;
  return result === 'connected'
    ? { kind: 'ok', text: 'Cuenta de Google conectada. Ya puedes enviar proformas directo.' }
    : { kind: 'error', text: params.get('reason') || 'No se pudo conectar la cuenta de Google.' };
}

/** Quita el resultado de la URL para que recargar la página no lo repita. */
function clearReturnParams(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('google')) return;
  params.delete('google');
  params.delete('reason');
  const rest = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
}

export function useGoogleReturn() {
  const [notice, setNotice] = useState(() => readReturnNotice(window.location.search));
  useEffect(() => { clearReturnParams(); }, []);
  return { notice, dismiss: () => setNotice(null) };
}
