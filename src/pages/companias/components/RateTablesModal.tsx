// Tarifarios de una compañía, abiertos desde su ficha.
//
// Por qué acá y no sólo en una pantalla global: **cada transportista cubre sus rutas a sus propios
// precios**. Carabobo → Caracas Norte puede costar distinto según quién la haga, así que el precio
// vive junto a la compañía, igual que su estructura de costos.
//
// Reusa la misma pantalla de la pestaña global acotada a esta compañía, en vez de duplicarla: una
// segunda versión divergiría al primer cambio.

import { useEffect, useState } from 'react';
import Button from '../../../components/base/Button';
import TarifariosTab from '../../reglas-tarifa/components/TarifariosTab';
import { ensurePartyProfile } from '../../../lib/tarifas/partiesDataSource';
import type { CarrierProfile } from '../../../lib/tarifas/parties';

interface Props {
  isOpen: boolean;
  party: CarrierProfile | null;
  /** Moneda del país, para rotular los importes. */
  currency?: string;
  /** Zonas del país, para sugerir valores en las columnas de zona. */
  zones: { id: string; code: string; name: string; zone_groups?: { name: string | null } | null }[];
  onClose: () => void;
  /** Se llama cuando se creó el perfil de cálculo del transportista, para refrescar la lista. */
  onProfileCreated?: () => void;
}

export default function RateTablesModal({ isOpen, party, currency, zones, onClose, onProfileCreated }: Props) {
  const [partyId, setPartyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // TarifariosTab cuelga los tarifarios de `party_id`: sin perfil no hay dónde guardarlos, así que
  // se crea al abrir (idempotente).
  useEffect(() => {
    if (!isOpen || !party) return;
    setError('');
    if (party.partyId) { setPartyId(party.partyId); return; }
    setPartyId(null);
    let cancelled = false;
    ensurePartyProfile(party.carrierId)
      .then((result) => {
        if (cancelled) return;
        if (result.status === 'failed') { setError(result.error.message); return; }
        setPartyId(result.partyId);
        if (result.created) onProfileCreated?.();
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, party]);

  if (!isOpen || !party) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-200 z-20">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Tarifarios de {party.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              El precio de cada ruta. Se ven los propios de esta compañía y los del país, que
              también la alcanzan.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="px-6 py-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
          )}
          {!partyId && !error && (
            <p className="text-sm text-slate-500 py-6 text-center">Cargando…</p>
          )}
          {partyId && (
            <TarifariosTab
              countryId={party.countryId ?? ''}
              currency={currency}
              zones={zones}
              partyId={partyId}
            />
          )}
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
