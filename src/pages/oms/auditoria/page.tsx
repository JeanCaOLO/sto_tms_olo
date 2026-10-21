import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Badge from '../../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import { usePermissions } from '../../../hooks/usePermissions';
import { omsApi } from '../api/omsApi';
import type { OmsLogEntry, OmsLogLevel } from '../types';

const LEVEL_BADGE: Record<OmsLogLevel, 'default' | 'warning' | 'danger'> = {
  info: 'default',
  warn: 'warning',
  error: 'danger',
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
//    corridas automáticas + modificaciones/procesados manuales a eFlow.
//  - Vista "Detalle (developer)": TODOS los logs, cada etapa y acción.
export default function OmsAuditoriaPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  // "developer" se señaliza con el mismo permiso que gatea el Simulador.
  const isDeveloper = can('oms.simulador', 'view');

  const [tab, setTab] = useState<Tab>('acciones');
  const [typeFilter, setTypeFilter] = useState<'todos' | 'automatico' | 'manual'>('todos');

  const [logs, setLogs] = useState<OmsLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    omsApi.getOmsLogs(500)
      .then((rows) => { if (!cancelled) setLogs(rows); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Vista principal: solo acciones de negocio, con filtro automático/manual.
  const acciones = logs
    .filter((l) => BUSINESS_ACTIONS.has(l.action))
    .filter((l) => typeFilter === 'todos'
      || (typeFilter === 'manual' ? esManual(l.action) : !esManual(l.action)));

  const accionesColumns: DataTableColumn<OmsLogEntry>[] = [
    { key: 'createdAt', header: 'Fecha', accessor: (l) => l.createdAt, sortable: true, render: (l) => <span className="text-slate-500">{l.createdAt}</span> },
    {
      key: 'tipo',
      header: 'Tipo',
      accessor: (l) => (esManual(l.action) ? 'Manual' : 'Automático'),
      filterable: true,
      render: (l) => <Badge variant={esManual(l.action) ? 'warning' : 'default'} size="sm">{esManual(l.action) ? 'Manual' : 'Automático'}</Badge>,
    },
    { key: 'action', header: 'Acción', accessor: (l) => l.action, sortable: true, filterable: true },
    { key: 'numeroViaje', header: 'Viaje', accessor: (l) => l.numeroViaje ?? '—', filterable: true },
    { key: 'eflowIdExpedicion', header: 'Pedido', accessor: (l) => l.eflowIdExpedicion ?? '—' },
    { key: 'message', header: 'Detalle', accessor: (l) => l.message, render: (l) => <span className="max-w-[360px] truncate block" title={l.message}>{l.message}</span> },
    { key: 'actor', header: 'Actor', accessor: (l) => l.actor, sortable: true, filterable: true },
  ];

  const detalleColumns: DataTableColumn<OmsLogEntry>[] = [
    { key: 'createdAt', header: 'Fecha', accessor: (l) => l.createdAt, sortable: true, render: (l) => <span className="text-slate-500">{l.createdAt}</span> },
    {
      key: 'level',
      header: 'Nivel',
      accessor: (l) => l.level,
      filterable: true,
      render: (l) => <Badge variant={LEVEL_BADGE[l.level]} size="sm">{l.level}</Badge>,
    },
    { key: 'action', header: 'Acción', accessor: (l) => l.action, sortable: true, filterable: true },
    { key: 'corridaId', header: 'Corrida', accessor: (l) => l.corridaId ?? '—' },
    { key: 'numeroViaje', header: 'Viaje', accessor: (l) => l.numeroViaje ?? '—', filterable: true },
    { key: 'eflowIdExpedicion', header: 'Pedido', accessor: (l) => l.eflowIdExpedicion ?? '—' },
    { key: 'message', header: 'Mensaje', accessor: (l) => l.message, render: (l) => <span className="max-w-[320px] truncate block" title={l.message}>{l.message}</span> },
    { key: 'actor', header: 'Actor', accessor: (l) => l.actor, sortable: true, filterable: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('omsAudit.title')}</h1>
        <p className="text-sm text-slate-600 mt-1">
          Acciones del OMS: corridas automáticas y acciones manuales (override, Procesar a Eflow).
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
        <>
          <div className="flex items-center gap-2">
            {(['todos', 'automatico', 'manual'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTypeFilter(tf)}
                className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                  typeFilter === tf ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tf === 'todos' ? t('omsAudit.filterAll') : tf === 'automatico' ? t('omsAudit.filterAuto') : t('omsAudit.filterManual')}
              </button>
            ))}
          </div>

          <DataTable
            data={acciones}
            columns={accionesColumns}
            getRowId={(l) => l.id}
            loading={loading}
            pageSize={25}
            searchPlaceholder={t('omsAudit.search')}
            exportFileName="auditoria_oms_acciones"
            emptyMessage="No hay acciones del OMS registradas todavía (se registran cuando el motor corre en vivo)."
          />
        </>
      )}

      {tab === 'detalle' && isDeveloper && (
        <DataTable
          data={logs}
          columns={detalleColumns}
          getRowId={(l) => l.id}
          loading={loading}
          pageSize={25}
          searchPlaceholder="Buscar en logs…"
          exportFileName="oms_logs_detalle"
          emptyMessage="No hay logs del OMS todavía (el backend los escribe cuando corre en vivo)."
        />
      )}
    </div>
  );
}
