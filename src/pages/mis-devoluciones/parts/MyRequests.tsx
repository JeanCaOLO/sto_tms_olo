// Historial del cliente: sus solicitudes enviadas con las fotos y videos que subió. Solo lectura.
import { useEffect, useState } from 'react';
import SolicitudCard from '../../../components/feature/SolicitudCard';
import type { RequestView } from '../../../lib/devoluciones/solicitudes';
import { listMine } from '../api/solicitudesApi';

export default function MyRequests() {
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listMine()
      .then((rows) => { if (!cancelled) setRequests(rows); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudieron cargar sus solicitudes.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [version]);

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error} <button type="button" className="cursor-pointer underline" onClick={() => setVersion((v) => v + 1)}>Reintentar</button>
        </p>
      )}
      {loading && requests.length === 0 && <p role="status" className="text-sm text-slate-500">Cargando…</p>}
      {!loading && !error && requests.length === 0 && <p className="text-sm text-slate-500">Todavía no ha enviado solicitudes.</p>}
      {requests.map((request) => <SolicitudCard key={request.id} request={request} />)}
    </div>
  );
}
