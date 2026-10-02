import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import Select from '../../../components/base/Select';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import { omsApi } from '../api/omsApi';
import { TIER_LABEL } from '../types';
import type { AuditEntry, Company, Country } from '../types';

const tierChange = (e: AuditEntry, t: TFunction) =>
  `${e.tierFrom === 'sin asignar' ? t('omsAudit.unassigned') : TIER_LABEL[e.tierFrom]} → ${TIER_LABEL[e.tierTo]}`;

// Pantalla Auditoría de Priorización (FR7): registro inmutable, solo lectura.
// Lista en DataTable (estándar del sistema: búsqueda, filtros por columna, orden,
// paginación y export .xlsx integrados).
export default function OmsAuditoriaPage() {
  const { t } = useTranslation();
  const country: Country = 'CR';
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState<string>('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'todos' | 'automatico' | 'manual'>('todos');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([omsApi.getCompanies(), omsApi.getAudit(country)])
      .then(([c, rows]) => {
        if (cancelled) return;
        setCompanies(c);
        setCompany((prev) => prev || c[0]?.id || '');
        setEntries(rows);
      })
      .catch(() => { if (!cancelled) setError(t('omsAudit.loadError')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const rows = entries.filter((e) => typeFilter === 'todos' || e.changeType === typeFilter);

  const columns: DataTableColumn<AuditEntry>[] = [
    { key: 'timestamp', header: t('omsAudit.colDate'), accessor: (e) => e.timestamp, sortable: true, render: (e) => <span className="text-slate-500">{e.timestamp}</span> },
    { key: 'orderId', header: t('omsAudit.colOrder'), accessor: (e) => e.orderId, sortable: true, render: (e) => <span className="font-medium text-slate-900">{e.orderId}</span> },
    {
      key: 'changeType',
      header: t('omsAudit.colType'),
      accessor: (e) => (e.changeType === 'manual' ? t('omsAudit.typeManual') : t('omsAudit.typeAuto')),
      filterable: true,
      render: (e) => (
        <Badge variant={e.changeType === 'manual' ? 'warning' : 'default'} size="sm">
          {e.changeType === 'manual' ? t('omsAudit.typeManual') : t('omsAudit.typeAuto')}
        </Badge>
      ),
    },
    {
      key: 'tier',
      header: t('omsAudit.colTier'),
      accessor: (e) => e.tierTo,
      render: (e) => <>{tierChange(e, t)}</>,
    },
    {
      key: 'score',
      header: t('omsAudit.colScore'),
      accessor: (e) => e.scoreTo,
      sortable: true,
      render: (e) => <>{e.scoreFrom ?? '—'} → {e.scoreTo}</>,
    },
    { key: 'actor', header: t('omsAudit.colActor'), accessor: (e) => e.actor, sortable: true, filterable: true },
    { key: 'detail', header: t('omsAudit.colDetail'), accessor: (e) => e.detail },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('omsAudit.title')}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {t('omsAudit.subtitle')}
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select
            label={t('omsAudit.company')}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
      </div>

      <Card padding={false}>
        <div className="flex items-center gap-2 p-4">
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

        {!loading && error && <div className="p-6 text-sm text-red-600">{error}</div>}
      </Card>

      {!error && (
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(e) => e.id}
          loading={loading}
          pageSize={25}
          searchPlaceholder={t('omsAudit.search')}
          exportFileName="auditoria_priorizacion"
          emptyMessage={t('omsAudit.empty')}
        />
      )}
    </div>
  );
}
