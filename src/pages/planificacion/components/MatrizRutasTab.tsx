import { useMemo, useState, type ReactNode } from 'react';
import { ROUTE_SYSTEMS, getRouteSystem } from '../route-systems/registry';
import { useRouteSystem } from '../route-systems/use-route-system';
import { useDebounced } from '../route-systems/use-debounced';
import { filterRows } from '../route-systems/filter';
import DataMatrix from './DataMatrix';

// Solo la matriz de "Días de ruta (EFLOW)" — el primero del registro. Se quitó el
// selector de sistemas (COFERSA Excel / Asignación de Viajes) por pedido de Ana.
const EFLOW_DIAS_ID = ROUTE_SYSTEMS[0]?.id ?? '';

export default function MatrizRutasTab({ pais }: { pais?: string }) {
  const system = getRouteSystem(EFLOW_DIAS_ID);
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);
  const { status, rows, reload } = useRouteSystem(system, pais);

  const filtered = useMemo(
    () => (system ? filterRows(rows, debounced, system.columns.map((c) => c.key)) : rows),
    [rows, debounced, system],
  );

  if (!system) return <Empty icon="ri-error-warning-line" text="Sistema de rutas desconocido." />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{system.description}</p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input
            type="search"
            aria-label={`Buscar en ${system.label}`}
            placeholder="Buscar por ruta o nombre…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>
        <span aria-live="polite" className="text-sm text-slate-500 whitespace-nowrap">
          {status === 'ready'
            ? `${filtered.length.toLocaleString('es')} de ${rows.length.toLocaleString('es')} filas`
            : ' '}
        </span>
      </div>

      {status === 'loading' && <Empty icon="ri-loader-4-line animate-spin" text="Cargando días de ruta…" />}
      {status === 'error' && (
        <Empty icon="ri-error-warning-line" text="No se pudo cargar la programación.">
          <button onClick={reload} className="mt-2 text-teal-600 hover:underline cursor-pointer">
            Reintentar
          </button>
        </Empty>
      )}
      {status === 'ready' && rows.length === 0 && (
        <Empty icon="ri-inbox-line" text="No hay días de ruta registrados." />
      )}
      {status === 'ready' && rows.length > 0 && filtered.length === 0 && (
        <Empty icon="ri-search-line" text={`Sin coincidencias para «${debounced}».`}>
          <button onClick={() => setQuery('')} className="mt-2 text-teal-600 hover:underline cursor-pointer">
            Limpiar filtro
          </button>
        </Empty>
      )}
      {status === 'ready' && filtered.length > 0 && (
        <DataMatrix
          caption={system.label}
          columns={system.columns}
          rows={filtered}
          pageSize={system.pageSize}
          resetKey={`${system.id}:${debounced}`}
        />
      )}
    </div>
  );
}

function Empty({ icon, text, children }: { icon: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 text-slate-500">
      <i className={`${icon} text-2xl mb-2`}></i>
      <p className="text-sm max-w-sm">{text}</p>
      {children}
    </div>
  );
}
