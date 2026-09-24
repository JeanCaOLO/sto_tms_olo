import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuditEvent, type AuditDetail } from '../audit-api';

interface Props {
  id: string;
  onClose: () => void;
}

function render(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function AuditDetailModal({ id, onClose }: Props) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getAuditEvent(id)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((err) => { if (!cancelled) setError((err as Error).message); });
    return () => { cancelled = true; };
  }, [id]);

  const changes = detail?.changes ? Object.entries(detail.changes) : [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{t('audit.detailTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
            aria-label={t('common.cancel')}
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <i className="ri-error-warning-line text-lg"></i><span>{error}</span>
            </div>
          )}

          {!detail && !error && (
            <div className="flex items-center justify-center py-10">
              <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
            </div>
          )}

          {detail && (
            <>
              {/* Tabla de cambios campo / antes / después */}
              {changes.length > 0 ? (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-left">
                        <th className="px-3 py-2 font-semibold text-slate-700">{t('audit.detailField')}</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">{t('audit.detailBefore')}</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">{t('audit.detailAfter')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map(([field, [before, after]]) => (
                        <tr key={field} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">{field}</td>
                          <td className="px-3 py-2 text-slate-500">{render(before)}</td>
                          <td className="px-3 py-2 text-slate-800">{render(after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">{t('audit.detailNoChanges')}</p>
              )}

              {/* Metadatos de la petición */}
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {detail.request_id && (
                  <div className="flex gap-2"><dt className="text-slate-500">{t('audit.detailRequest')}:</dt><dd className="font-mono text-xs text-slate-700 break-all">{detail.request_id}</dd></div>
                )}
                {detail.ip && (
                  <div className="flex gap-2"><dt className="text-slate-500">{t('audit.detailIp')}:</dt><dd className="text-slate-700">{detail.ip}</dd></div>
                )}
                {detail.user_agent && (
                  <div className="flex gap-2 sm:col-span-2"><dt className="text-slate-500">{t('audit.detailUserAgent')}:</dt><dd className="text-slate-700 break-all">{detail.user_agent}</dd></div>
                )}
              </dl>

              {detail.metadata && Object.keys(detail.metadata).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('audit.detailMetadata')}</p>
                  <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 overflow-x-auto">{JSON.stringify(detail.metadata, null, 2)}</pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
