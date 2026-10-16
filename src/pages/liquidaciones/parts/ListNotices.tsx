// Avisos de las listas del liquidador: viajes recortados e historial paginado.

import Button from '../../../components/base/Button';
import { TRIPS_LIMIT } from '../../../lib/tarifas/tripsDataSource';

export function TruncatedNotice() {
  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
      Hay más viajes pendientes de los que se pueden mostrar a la vez ({TRIPS_LIMIT}). Acotá el rango de fechas
      para ver el resto.
    </div>
  );
}

interface LoadMoreProps {
  shown: number;
  loading: boolean;
  onLoadMore: () => void;
}

export function LoadMoreBar({ shown, loading, onLoadMore }: LoadMoreProps) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2 text-xs text-slate-500">
      <span>Se muestran las {shown} liquidaciones más recientes; hay más antiguas.</span>
      <Button variant="secondary" size="sm" onClick={onLoadMore} disabled={loading}>
        {loading ? 'Cargando…' : 'Cargar más antiguas'}
      </Button>
    </div>
  );
}
