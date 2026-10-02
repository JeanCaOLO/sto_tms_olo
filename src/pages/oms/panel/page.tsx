import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import Select from '../../../components/base/Select';
import StatCard from '../../../components/feature/StatCard';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import { TIER_LABEL, type PriorityTier, type OmsAlert } from '../types';
import { usePanelController } from './usePanelController';

const buildAlertColumns = (t: TFunction): DataTableColumn<OmsAlert>[] => [
  {
    key: 'severity',
    header: t('omsPanel.colSeverity'),
    accessor: (a) => a.severity,
    filterable: true,
    render: (a) => (
      <Badge variant={a.severity === 'critica' ? 'danger' : 'warning'}>
        {a.severity === 'critica' ? t('omsPanel.severityCritical') : t('omsPanel.severityWarning')}
      </Badge>
    ),
  },
  { key: 'type', header: t('omsPanel.colType'), accessor: (a) => a.type, sortable: true, filterable: true },
  { key: 'orderId', header: t('omsPanel.colOrder'), accessor: (a) => a.orderId, sortable: true, render: (a) => <span className="font-medium text-slate-900">{a.orderId}</span> },
  { key: 'timestamp', header: t('omsPanel.colTimestamp'), accessor: (a) => a.timestamp, sortable: true, render: (a) => <span className="text-slate-500">{a.timestamp}</span> },
];

// Colores por tier para la distribución (paleta del design system, tema claro).
const TIER_BAR: Record<PriorityTier, { dot: string; bar: string; text: string }> = {
  1: { dot: 'bg-red-500', bar: 'bg-red-500', text: 'text-red-600' },
  2: { dot: 'bg-amber-500', bar: 'bg-amber-500', text: 'text-amber-600' },
  3: { dot: 'bg-teal-500', bar: 'bg-teal-500', text: 'text-teal-600' },
  4: { dot: 'bg-slate-400', bar: 'bg-slate-400', text: 'text-slate-600' },
};

// Pantalla Panel OMS — dashboard de salud del motor (FR4).
export default function OmsPanelPage() {
  const { t } = useTranslation();
  const { companies, company, setCompany, kpis, alerts, distribution, loading, error } = usePanelController();

  const alertColumns = buildAlertColumns(t);
  const maxCount = Math.max(1, ...distribution.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('omsPanel.title')}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {t('omsPanel.subtitle')}
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select
            label={t('omsPanel.company')}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
        </div>
      )}

      {!loading && error && (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-center gap-3 text-amber-800">
            <i className="ri-wifi-off-line text-xl"></i>
            <div>
              <p className="text-sm font-medium">{error}</p>
              <p className="text-xs mt-1">{t('omsPanel.retryingHint')}</p>
            </div>
          </div>
        </Card>
      )}

      {!loading && !error && kpis && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title={t('omsPanel.kpiPending')} value={kpis.pendientes} icon="ri-stack-line" color="teal" />
            <StatCard title={t('omsPanel.kpiOverdue')} value={kpis.vencidos} icon="ri-alarm-warning-line" color="red" />
            <StatCard title={t('omsPanel.kpiOverride')} value={`${kpis.overridePct}%`} icon="ri-hand-coin-line" color="amber" />
            <StatCard title={t('omsPanel.kpiNoRoute')} value={kpis.sinRuta} icon="ri-question-line" color="blue" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-slate-900">{t('omsPanel.activeAlerts')}</h2>
                <span className="text-xs text-slate-500">{t('omsPanel.updatedHint')}</span>
              </div>
              <DataTable
                data={alerts}
                columns={alertColumns}
                getRowId={(a) => a.id}
                searchPlaceholder={t('omsPanel.searchAlert')}
                exportFileName="alertas_oms"
                emptyMessage={t('omsPanel.emptyAlerts')}
              />
            </Card>

            <Card>
              <div className="flex items-center gap-2 mb-6">
                <i className="ri-pie-chart-2-line text-teal-600 text-lg"></i>
                <h2 className="text-lg font-semibold text-slate-900">{t('omsPanel.distributionTitle')}</h2>
              </div>
              <div className="space-y-4">
                {distribution.map((d) => {
                  const c = TIER_BAR[d.tier];
                  return (
                    <div key={d.tier} className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-sm ${c.dot}`} aria-hidden="true"></span>
                      <span className="text-sm text-slate-600 w-16">{TIER_LABEL[d.tier]}</span>
                      <span className={`text-sm font-bold w-10 text-right ${c.text}`}>{d.count}</span>
                      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${c.bar}`}
                          style={{ width: `${Math.round((d.count / maxCount) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500">
                {t('omsPanel.totalOrders', { count: distribution.reduce((s, d) => s + d.count, 0) })}
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
