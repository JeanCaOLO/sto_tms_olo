import { useEffect, useState } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import OmsPageHeader from '../components/OmsPageHeader';
import { omsApi } from '../api/omsApi';
import { TIER_LABEL } from '../types';
import type { AuditEntry, Country } from '../types';

// Pantalla Auditoría de Priorización (FR7): registro inmutable, solo lectura.
export default function OmsAuditoriaPage() {
  const [country, setCountry] = useState<Country>('CR');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'todos' | 'automatico' | 'manual'>('todos');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    omsApi.getAudit(country)
      .then((rows) => { if (!cancelled) setEntries(rows); })
      .catch(() => { if (!cancelled) setError('No se pudo cargar la auditoría.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country]);

  const rows = entries.filter((e) => typeFilter === 'todos' || e.changeType === typeFilter);

  const columns: DataTableColumn<AuditEntry>[] = [
    { key: 'timestamp', header: 'Fecha', accessor: (e) => e.timestamp, sortable: true, render: (e) => <span className="text-slate-500">{e.timestamp}</span> },
    { key: 'orderId', header: 'Pedido', accessor: (e) => e.orderId, sortable: true, render: (e) => <span className="font-medium text-slate-900">{e.orderId}</span> },
    {
      key: 'changeType',
      header: 'Tipo',
      accessor: (e) => (e.changeType === 'manual' ? 'Manual' : 'Automático'),
      filterable: true,
      render: (e) => (
        <Badge variant={e.changeType === 'manual' ? 'warning' : 'default'} size="sm">
          {e.changeType === 'manual' ? 'Manual' : 'Automático'}
        </Badge>
      ),
    },
    {
      key: 'tier',
      header: 'Tier',
      accessor: (e) => e.tierTo,
      render: (e) => (
        <>{e.tierFrom === 'sin asignar' ? 'sin asignar' : TIER_LABEL[e.tierFrom]} → {TIER_LABEL[e.tierTo]}</>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      accessor: (e) => e.scoreTo,
      sortable: true,
      render: (e) => <>{e.scoreFrom ?? '—'} → {e.scoreTo}</>,
    },
    { key: 'actor', header: 'Actor', accessor: (e) => e.actor, sortable: true, filterable: true },
    { key: 'detail', header: 'Detalle', accessor: (e) => e.detail },
  ];

  return (
    <div className="space-y-6">
      <OmsPageHeader
        title="Auditoría de Priorización"
        subtitle="Registro inmutable de cambios de prioridad (solo lectura)"
        country={country}
        onCountryChange={setCountry}
      />

      <Card padding={false}>
        <div className="flex items-center gap-2 p-4">
          {(['todos', 'automatico', 'manual'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors ${
                typeFilter === t ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t === 'todos' ? 'Todos' : t === 'automatico' ? 'Automáticos' : 'Manuales'}
            </button>
          ))}
        </div>

        {!loading && error && <div className="p-6 text-sm text-red-600">{error}</div>}
      </Card>

      {!error && (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(e) => e.id}
          loading={loading}
          pageSize={25}
          searchPlaceholder="Buscar por pedido, actor o detalle..."
          exportFileName="auditoria_priorizacion"
          emptyMessage="No hay registros para estos criterios."
        />
      )}
    </div>
  );
}
