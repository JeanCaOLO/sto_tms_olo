import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Badge from '../../../components/base/Badge';
import Button from '../../../components/base/Button';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import { confirmAction } from '../../../lib/confirm';
import { notify } from '../../../lib/notify';
import { usePermissions } from '../../../hooks/usePermissions';
import { useOperationalContext } from '../../../hooks/useOperationalContext';
import { omsApi } from '../api/omsApi';
import { formatFechaHora } from '../fecha';
import LogDetailModal from './LogDetailModal';
import { actionLabel, displayMessage } from './logLabels';
import type { OmsLogEntry, OmsLogLevel } from '../types';

// Color del nivel en la consola de detalle (fondo oscuro).
const LEVEL_CONSOLE: Record<OmsLogLevel, string> = {
  info: 'text-emerald-300',
  warn: 'text-amber-300',
  error: 'text-red-400',
};

// Acciones de NEGOCIO que ve la auditoría principal: la corrida automática del
// OMS (barrido) y las acciones MANUALES (override de prioridad, "Procesar a
// Eflow"). El resto (etapas internas, detalle por pedido) solo lo ve developer.
const BUSINESS_ACTIONS = new Set(['barrido', 'procesar_viaje', 'override_manual']);

// Automático = la corrida del motor; manual = lo que dispara una persona.
const esManual = (action: string) => action !== 'barrido';

type Tab = 'acciones' | 'detalle';

// Auditoría del OMS. Todo el flujo se automatizó, así que la auditoría ya no son
// "cambios de un usuario": son los LOGS del OMS (tabla oms_logs, sql/49).
//  - Vista principal "Acciones del OMS" (cualquiera con permiso de auditoría):
//    corridas automáticas + modificaciones/procesados manuales a eFlow. La tabla
//    muestra TODAS; el tipo (automático/manual) se filtra desde la cabecera.
//  - Vista "Detalle (developer)": consola con TODOS los logs, con búsqueda y la
//    acción de LIMPIAR la bitácora.
export default function OmsAuditoriaPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const { countries, selectedCountryId } = useOperationalContext();
  // Zona horaria del país del contexto (IANA); si no hay país/zona, el helper cae a CR.
  const timeZone = countries.find((c) => c.id === selectedCountryId)?.timezone ?? null;
  // "developer" se señaliza con el mismo permiso que gatea el Simulador.
  const isDeveloper = can('oms.simulador', 'view');

  const [tab, setTab] = useState<Tab>('acciones');

  const [logs, setLogs] = useState<OmsLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [clearing, setClearing] = useState(false);
  const [selected, setSelected] = useState<OmsLogEntry | null>(null);
  // Rango de fechas (YYYY-MM-DD) para la limpieza de la bitácora.
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  function cargar() {
    let cancelled = false;
    setLoading(true);
    omsApi.getOmsLogs(500)
      .then((rows) => { if (!cancelled) setLogs(rows); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }

  useEffect(() => cargar(), []);

  // Día siguiente de una fecha YYYY-MM-DD (límite superior exclusivo del rango).
  function diaSiguiente(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  async function limpiarRango() {
    if (!desde || !hasta) return;
    if (desde > hasta) {
      notify('El rango es inválido: "Desde" no puede ser mayor que "Hasta".', 'warning');
      return;
    }
    const ok = await confirmAction({
      title: 'Limpiar bitácora del OMS',
      message: `Se eliminarán los logs del OMS entre ${desde} y ${hasta} (ambos inclusive). Esta acción no se puede deshacer.`,
      confirmLabel: 'Limpiar rango',
      variant: 'danger',
    });
    if (!ok) return;
    setClearing(true);
    try {
      const borrados = await omsApi.clearOmsLogs({
        fromIso: `${desde}T00:00:00`,
        toIso: `${diaSiguiente(hasta)}T00:00:00`,
      });
      notify(`Bitácora limpiada: ${borrados} log(s) eliminados.`, 'success');
      cargar();
    } catch (err) {
      notify(`No se pudo limpiar la bitácora: ${err instanceof Error ? err.message : 'error'}`, 'error');
    } finally {
      setClearing(false);
    }
  }

  // Vista principal: solo acciones de negocio. La tabla las muestra TODAS; el
  // filtro automático/manual vive en la cabecera de la columna "Tipo".
  const acciones = logs.filter((l) => BUSINESS_ACTIONS.has(l.action));

  // Consola de detalle: TODOS los logs, filtrados por el texto de búsqueda.
  const detalle = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) =>
      [l.message, displayMessage(l), l.action, actionLabel(l.action), l.corridaId, l.actor, l.level]
        .some((v) => (v ?? '').toString().toLowerCase().includes(q)));
  }, [logs, query]);

  const accionesColumns: DataTableColumn<OmsLogEntry>[] = [
    { key: 'createdAt', header: 'Fecha', accessor: (l) => l.createdAt, sortable: true, render: (l) => <span className="text-slate-500">{formatFechaHora(l.createdAt, timeZone)}</span> },
    {
      key: 'tipo',
      header: 'Tipo',
      accessor: (l) => (esManual(l.action) ? 'Manual' : 'Automático'),
      filterable: true,
      render: (l) => <Badge variant={esManual(l.action) ? 'warning' : 'default'} size="sm">{esManual(l.action) ? 'Manual' : 'Automático'}</Badge>,
    },
    { key: 'action', header: 'Acción', accessor: (l) => actionLabel(l.action), sortable: true, filterable: true },
    { key: 'message', header: 'Detalle', accessor: (l) => displayMessage(l), render: (l) => <span className="max-w-[360px] truncate block" title={displayMessage(l)}>{displayMessage(l)}</span> },
    { key: 'actor', header: 'Actor', accessor: (l) => l.actor, sortable: true, filterable: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('omsAudit.title')}</h1>
        <p className="text-sm text-slate-600 mt-1">
          Acciones del OMS: ejecuciones automáticas y acciones manuales (override, Procesar a Eflow).
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab('acciones')}
          className={`px-4 py-2 text-sm cursor-pointer -mb-px border-b-2 transition-colors ${
            tab === 'acciones' ? 'border-teal-600 text-teal-700 font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Acciones del OMS
        </button>
        {isDeveloper && (
          <button
            onClick={() => setTab('detalle')}
            className={`px-4 py-2 text-sm cursor-pointer -mb-px border-b-2 transition-colors ${
              tab === 'detalle' ? 'border-teal-600 text-teal-700 font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Detalle
            <span className="ml-1.5 text-xs text-slate-400">(developer)</span>
          </button>
        )}
      </div>

      {tab === 'acciones' && (
        <DataTable
          data={acciones}
          columns={accionesColumns}
          getRowId={(l) => l.id}
          loading={loading}
          pageSize={25}
          searchPlaceholder={t('omsAudit.search')}
          exportFileName="auditoria_oms_acciones"
          emptyMessage="No hay acciones del OMS registradas todavía (se registran cuando el motor corre en vivo)."
          onRowClick={(l) => setSelected(l)}
        />
      )}

      {tab === 'detalle' && isDeveloper && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en logs (mensaje, acción, viaje, pedido, ejecución…)"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <span className="text-xs text-slate-500">{detalle.length} / {logs.length} líneas</span>
            <Button variant="secondary" size="sm" onClick={() => cargar()} disabled={loading}>
              Refrescar
            </Button>
          </div>

          {/* Limpieza por RANGO de fechas (developer). El backend borra las filas
              con created_at dentro del rango; "Hasta" es inclusivo. */}
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <label className="flex flex-col text-xs text-slate-500">
              Desde
              <input
                type="date"
                value={desde}
                max={hasta || undefined}
                onChange={(e) => setDesde(e.target.value)}
                className="mt-0.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </label>
            <label className="flex flex-col text-xs text-slate-500">
              Hasta
              <input
                type="date"
                value={hasta}
                min={desde || undefined}
                onChange={(e) => setHasta(e.target.value)}
                className="mt-0.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </label>
            <Button
              variant="danger"
              size="sm"
              onClick={limpiarRango}
              disabled={clearing || !desde || !hasta}
            >
              {clearing ? 'Limpiando…' : 'Limpiar rango'}
            </Button>
            <span className="text-xs text-slate-400">Borra los logs en el rango indicado (no todos).</span>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 font-mono text-xs leading-relaxed text-slate-200 overflow-auto max-h-[70vh]">
            {loading ? (
              <div className="p-4 text-slate-400">Cargando logs…</div>
            ) : detalle.length === 0 ? (
              <div className="p-4 text-slate-400">
                {logs.length === 0
                  ? 'No hay logs del OMS todavía (el backend los escribe cuando corre en vivo).'
                  : 'Ningún log coincide con la búsqueda.'}
              </div>
            ) : (
              <ul className="divide-y divide-slate-800/60">
                {detalle.map((l) => (
                  <li
                    key={l.id}
                    className="px-3 py-1.5 hover:bg-slate-900/60 cursor-pointer"
                    onClick={() => setSelected(l)}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-slate-500 shrink-0">{formatFechaHora(l.createdAt, timeZone)}</span>
                      <span className={`shrink-0 uppercase ${LEVEL_CONSOLE[l.level]}`}>[{l.level}]</span>
                      <span className="text-teal-300 shrink-0">{actionLabel(l.action)}</span>
                      {l.corridaId && <span className="text-slate-500 shrink-0">({l.corridaId})</span>}
                      <span className="text-slate-200 break-all">{displayMessage(l)}</span>
                      <span className="text-slate-600 shrink-0">· {l.actor}</span>
                    </div>
                    {l.detail != null && (
                      <pre className="mt-0.5 whitespace-pre-wrap break-all text-[11px] text-slate-400">
                        {typeof l.detail === 'string' ? l.detail : JSON.stringify(l.detail)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {selected && <LogDetailModal log={selected} timeZone={timeZone} onClose={() => setSelected(null)} />}
    </div>
  );
}
