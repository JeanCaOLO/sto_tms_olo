import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ROUTE_SYSTEMS, getRouteSystem } from '../route-systems/registry';
import { useRouteSystem } from '../route-systems/use-route-system';
import { useDebounced } from '../route-systems/use-debounced';
import { filterRows } from '../route-systems/filter';
import DataMatrix from './DataMatrix';
import MatrizLeyenda from './MatrizLeyenda';

const DEFAULT_ID = ROUTE_SYSTEMS[0]?.id ?? '';

export default function MatrizRutasTab() {
  const [params, setParams] = useSearchParams();
  const systemId = getRouteSystem(params.get('sistema') ?? '') ? params.get('sistema')! : DEFAULT_ID;
  const system = getRouteSystem(systemId);
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);
  const { status, rows, reload } = useRouteSystem(system);

  const filtered = useMemo(
    () => (system ? filterRows(rows, debounced, system.columns.map((c) => c.key)) : rows),
    [rows, debounced, system],
  );

  const selectSystem = (id: string) => {
    setParams((p) => {
      p.set('sistema', id);
      return p;
    });
    setQuery('');
  };

  if (!system) return <Empty icon="ri-error-warning-line" text="Sistema de rutas desconocido." />;

  return (
    <div className="space-y-4">
      <SystemPicker activeId={system.id} onSelect={selectSystem} />
      <p className="text-sm text-slate-500">{system.description}</p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input
            type="search"
            aria-label={`Buscar en ${system.label}`}
            placeholder="Buscar por destino, conductor, nº de viaje…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
        </div>
        <span aria-live="polite" className="text-sm text-slate-500 whitespace-nowrap">
          {status === 'ready'
            ? `${filtered.length.toLocaleString('es')} de ${rows.length.toLocaleString('es')} filas`
            : ' '}
        </span>
      </div>

      {status === 'loading' && <Empty icon="ri-loader-4-line animate-spin" text="Cargando programación…" />}
      {status === 'error' && (
        <Empty icon="ri-error-warning-line" text="No se pudo cargar la programación.">
          <button onClick={reload} className="mt-2 text-teal-600 hover:underline cursor-pointer">
            Reintentar
          </button>
        </Empty>
      )}
      {status === 'not-generated' && (
        <Empty
          icon="ri-file-list-3-line"
          text={`La programación de ${system.label} todavía no se ha generado. Ejecuta \`pnpm run data:build\`.`}
        />
      )}
      {status === 'ready' && rows.length === 0 && (
        <Empty icon="ri-inbox-line" text="Este sistema no tiene filas registradas." />
      )}
      {status === 'ready' && rows.length > 0 && filtered.length === 0 && (
        <Empty icon="ri-search-line" text={`Sin coincidencias para «${debounced}».`}>
          <button onClick={() => setQuery('')} className="mt-2 text-teal-600 hover:underline cursor-pointer">
            Limpiar filtro
          </button>
        </Empty>
      )}
      {status === 'ready' && filtered.length > 0 && system.id === 'cofersa' && <MatrizLeyenda />}
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

function SystemPicker({ activeId, onSelect }: { activeId: string; onSelect: (id: string) => void }) {
  if (ROUTE_SYSTEMS.length > 5) {
    return (
      <select
        aria-label="Sistema de rutas"
        value={activeId}
        onChange={(e) => onSelect(e.target.value)}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2"
      >
        {ROUTE_SYSTEMS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div role="group" aria-label="Sistema de rutas" className="flex flex-wrap gap-1 border-b border-slate-200">
      {ROUTE_SYSTEMS.map((s) => (
        <button
          key={s.id}
          aria-pressed={s.id === activeId}
          onClick={() => onSelect(s.id)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
            s.id === activeId
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {s.label}
        </button>
      ))}
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
