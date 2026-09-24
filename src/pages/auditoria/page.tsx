import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import Badge from '../../components/base/Badge';
import Button from '../../components/base/Button';
import NoAccess from '../NoAccess';
import { usePermissions } from '../../hooks/usePermissions';
import { getAuditEvents, postAuditEvent, type AuditRow, type AuditFilters } from './audit-api';
import { ACTION_META, moduleI18nKey } from './audit-labels';
import AuditDetailModal from './components/AuditDetailModal';
import AuditFiltersBar from './components/AuditFiltersBar';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function AuditoriaPage() {
  const { t, i18n } = useTranslation();
  const { can } = usePermissions();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [filters, setFilters] = useState<AuditFilters>({ from: todayIso() });
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    setError('');
    try {
      const page = await getAuditEvents({ ...filters, limit: 50, before_id: reset ? undefined : cursor ?? undefined });
      setRows((prev) => (reset ? page.data : [...prev, ...page.data]));
      setCursor(page.next_cursor);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters, cursor]);

  // Recarga desde cero cuando cambian los filtros (o al montar).
  useEffect(() => {
    if (!can('auditoria', 'view')) return;
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  if (!can('auditoria', 'view')) return <NoAccess />;

  const fmtWhen = (iso: string) => new Date(iso).toLocaleString(i18n.resolvedLanguage ?? 'es');

  const actorLabel = (r: AuditRow) => {
    if (r.actor_type === 'user') return r.actor_email ?? '—';
    if (r.actor_type === 'system') return `${t('audit.actorSystem')}${r.source ? ` · ${r.source}` : ''}`;
    return t('audit.actorAnonymous');
  };

  const handleExport = () => {
    const data = rows.map((r) => ({
      [t('audit.colWhen')]: fmtWhen(r.occurred_at),
      [t('audit.colActor')]: actorLabel(r),
      [t('audit.colAction')]: t(ACTION_META[r.action]?.key ?? r.action),
      [t('audit.colModule')]: moduleI18nKey(r.module_key) ? t(moduleI18nKey(r.module_key)!) : (r.module_key ?? '—'),
      [t('audit.colEntity')]: [r.entity_table, r.entity_id].filter(Boolean).join(' · ') || '—',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audit');
    XLSX.writeFile(wb, `auditoria-${todayIso()}.xlsx`);
    postAuditEvent('export', 'auditoria', { rows: rows.length, format: 'xlsx' });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('audit.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('audit.subtitle')}</p>
        </div>
        <Button variant="secondary" onClick={handleExport} disabled={rows.length === 0}
          icon={<i className="ri-file-excel-2-line"></i>}>
          {t('audit.export')}
        </Button>
      </div>

      <AuditFiltersBar value={filters} onApply={setFilters} />

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <i className="ri-error-warning-line"></i>{error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">{t('audit.colWhen')}</th>
                <th className="px-4 py-3 font-semibold text-slate-700">{t('audit.colActor')}</th>
                <th className="px-4 py-3 font-semibold text-slate-700">{t('audit.colAction')}</th>
                <th className="px-4 py-3 font-semibold text-slate-700">{t('audit.colModule')}</th>
                <th className="px-4 py-3 font-semibold text-slate-700">{t('audit.colEntity')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = ACTION_META[r.action];
                const modKey = moduleI18nKey(r.module_key);
                return (
                  <tr key={r.id} onClick={() => setDetailId(r.id)}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtWhen(r.occurred_at)}</td>
                    <td className="px-4 py-3 text-slate-700">{actorLabel(r)}</td>
                    <td className="px-4 py-3"><Badge variant={meta?.variant ?? 'default'} size="sm">{t(meta?.key ?? r.action)}</Badge></td>
                    <td className="px-4 py-3 text-slate-700">{modKey ? t(modKey) : (r.module_key ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-500">{[r.entity_table, r.entity_id].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">{t('audit.empty')}</td></tr>
              )}
              {loading && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400"><i className="ri-loader-4-line animate-spin text-xl"></i></td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-center px-4 py-3 border-t border-slate-100">
          {cursor ? (
            <Button variant="secondary" onClick={() => load(false)} disabled={loading}>
              {t('audit.loadMore')}
            </Button>
          ) : rows.length > 0 ? (
            <span className="text-xs text-slate-400">{t('audit.noMore')}</span>
          ) : null}
        </div>
      </div>

      {detailId && <AuditDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
