// Selección de conductor y transportista en una sola caja.
//
// Reemplaza dos listas desplegables sueltas —una con TODOS los transportistas y otra con TODOS los
// conductores, sin relación entre sí— por el flujo que pide el trabajo real: la guía física trae el
// nombre y la cédula del conductor, casi nunca el nombre de la compañía. Se escribe cualquiera de
// los dos y el transportista se completa solo.
//
// El camino inverso también funciona: eligiendo primero el transportista, la búsqueda queda acotada
// a sus conductores.
//
// Toda la lógica de búsqueda y orden vive en `lib/tarifas/driverSearch.ts`, que es puro y testeado.
//
// Vive en `components/tarifas/` y no bajo una pantalla porque lo usan las dos: el alta de
// liquidación y el Probador del motor. Una copia por pantalla divergiría al primer cambio — que es
// exactamente lo que ya pasó con el armado de la entrada del motor.

import { useEffect, useMemo, useRef, useState } from 'react';
import Badge from '../base/Badge';
import {
  searchDrivers, type DriverOption, type MatchReason,
} from '../../lib/tarifas/driverSearch';

interface Props {
  drivers: DriverOption[];
  carriers: { id: string; name: string }[];
  driverId: string;
  carrierId: string;
  onChange: (next: { driverId: string; carrierId: string }) => void;
  disabled?: boolean;
}

const MATCH_LABEL: Record<MatchReason, string> = {
  document: 'cédula',
  name: 'nombre',
  carrier: 'transportista',
};

export default function DriverCarrierPicker({
  drivers, carriers, driverId, carrierId, onChange, disabled,
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => drivers.find((d) => d.id === driverId) ?? null,
    [drivers, driverId],
  );

  // Al elegir un transportista, la búsqueda se acota a los suyos.
  const results = useMemo(
    () => searchDrivers(drivers, query, { carrierId: carrierId || null, limit: 12 }),
    [drivers, query, carrierId],
  );

  useEffect(() => { setHighlight(0); }, [query, carrierId]);

  // Cerrar al hacer clic afuera: sin esto la lista queda flotando sobre el resto del formulario.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const pick = (driver: DriverOption) => {
    // Elegir el conductor arrastra su transportista. Si no tiene, se limpia en vez de dejar el
    // anterior: sería un dato falso pegado de la selección previa.
    onChange({ driverId: driver.id, carrierId: driver.carrierId ?? '' });
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    onChange({ driverId: '', carrierId: '' });
    setQuery('');
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = results[highlight];
      if (hit) pick(hit.driver);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const carrierName = carriers.find((c) => c.id === carrierId)?.name;
  const sinTransportista = !!selected && !selected.carrierId;

  return (
    <div className="space-y-3">
      {/* ── Buscador ────────────────────────────────────────────────────────────────────── */}
      <div ref={containerRef} className="relative">
        <label htmlFor="driver-search" className="block text-sm font-medium text-gray-700 mb-1">
          Conductor <span className="text-red-500">*</span>
        </label>

        {selected ? (
          <div className="flex items-center justify-between gap-2 px-3 py-2 border border-teal-300 bg-teal-50 rounded-lg">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800 truncate">{selected.fullName}</div>
              <div className="text-xs text-slate-500 truncate">
                {selected.document || 'sin cédula'}
                {selected.carrierName ? ` · ${selected.carrierName}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={clear}
              disabled={disabled}
              className="shrink-0 text-slate-400 hover:text-red-600 cursor-pointer disabled:opacity-40"
              title="Cambiar conductor"
            >
              <i className="ri-close-circle-line text-lg"></i>
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input
                id="driver-search"
                type="text"
                value={query}
                disabled={disabled}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKeyDown}
                placeholder="Nombre, cédula o transportista…"
                autoComplete="off"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-slate-50"
              />
            </div>

            {open && (
              <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
                {results.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-slate-500">
                    {drivers.length === 0
                      ? 'No hay conductores cargados.'
                      : `Ningún conductor coincide con "${query}".`}
                  </li>
                ) : (
                  results.map((result, index) => (
                    <li key={result.driver.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => pick(result.driver)}
                        className={`w-full text-left px-3 py-2 cursor-pointer ${
                          index === highlight ? 'bg-teal-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-slate-800 truncate">{result.driver.fullName}</span>
                          {query && (
                            <span className="text-[10px] text-slate-400 shrink-0">
                              por {MATCH_LABEL[result.matchedOn]}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {result.driver.document || 'sin cédula'}
                          {' · '}
                          {result.driver.carrierName ?? 'sin transportista'}
                        </div>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}

            <p className="text-xs text-slate-500 mt-1">
              La guía física trae el nombre y la cédula: escribí cualquiera de los dos y el
              transportista se completa solo.
            </p>
          </>
        )}
      </div>

      {/* ── Transportista ───────────────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="carrier-select" className="block text-sm font-medium text-gray-700 mb-1">
          Transportista <span className="text-red-500">*</span>
        </label>
        <select
          id="carrier-select"
          value={carrierId}
          disabled={disabled}
          onChange={(e) => {
            const nextCarrier = e.target.value;
            // Cambiar de transportista invalida al conductor elegido si ya no pertenece: dejarlo
            // produciría una liquidación con un conductor de otra compañía.
            const sigueValiendo = selected && selected.carrierId === nextCarrier;
            onChange({ driverId: sigueValiendo ? driverId : '', carrierId: nextCarrier });
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-slate-50"
        >
          <option value="">Todos los transportistas</option>
          {carriers.map((carrier) => (
            <option key={carrier.id} value={carrier.id}>{carrier.name}</option>
          ))}
        </select>

        {carrierId && !selected && (
          <p className="text-xs text-teal-700 mt-1">
            <i className="ri-filter-3-line mr-1"></i>
            La búsqueda de conductor está acotada a {carrierName}.
          </p>
        )}

        {sinTransportista && (
          <div className="mt-2">
            <Badge variant="warning" size="sm">
              Este conductor no tiene transportista asignado
            </Badge>
            <p className="text-xs text-slate-500 mt-1">
              Puede ser flota propia, o un dato que falta en Catálogos → Conductores. Elegí el
              transportista a mano si corresponde.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
