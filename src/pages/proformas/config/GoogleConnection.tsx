// Cuenta de Google desde la que el usuario envía las proformas. Se conecta una vez; queda guardada.
// Cada usuario conecta la suya: se muestra en la configuración y también al enviar.

import { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/base/Button';
import {
  disconnectGoogle, getGoogleStatus, startGoogleConnect, type GoogleStatus,
} from '../../../lib/tarifas/proformas';

interface Props {
  /** Avisa cuando cambia el estado de la conexión (el modal de envío lo usa para habilitar "Enviar"). */
  onStatus?: (status: GoogleStatus) => void;
}

export default function GoogleConnection({ onStatus }: Props) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((next: GoogleStatus) => { setStatus(next); onStatus?.(next); }, [onStatus]);

  useEffect(() => {
    getGoogleStatus().then(apply).catch((e) => setError(e instanceof Error ? e.message : 'No se pudo consultar Google.'));
  }, [apply]);

  async function connect() {
    setBusy(true); setError(null);
    try {
      window.location.assign(await startGoogleConnect());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la conexión.');
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true); setError(null);
    try {
      apply(await disconnectGoogle());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desconectar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium text-slate-800">Cuenta de Google para enviar</div>
          <div className="text-slate-500">
            {status === null ? 'Consultando…' : status.connected ? `Conectada: ${status.email ?? 'cuenta de Google'}` : 'Sin conectar. Cada usuario conecta su propia cuenta.'}
          </div>
        </div>
        {status?.connected
          ? <Button variant="secondary" disabled={busy} onClick={() => void disconnect()}>Desconectar</Button>
          : <Button disabled={busy || status === null} icon={<i className="ri-google-fill" />} onClick={() => void connect()}>Conectar con Google</Button>}
      </div>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <p className="text-xs text-slate-400">Solo se pide permiso para enviar correos; el TMS no puede leer tu buzón.</p>
    </div>
  );
}
