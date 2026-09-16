import { useEffect, useState } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import Select from '../../../components/base/Select';
import ViewToggle from '../components/ViewToggle';
import { useOmsView } from '../useOmsView';
import { omsApi } from '../api/omsApi';
import { TIER_LABEL } from '../types';
import type { AuditEntry, Company, Country } from '../types';

const tierChange = (e: AuditEntry) =>
  `${e.tierFrom === 'sin asignar' ? 'sin asignar' : TIER_LABEL[e.tierFrom]} → ${TIER_LABEL[e.tierTo]}`;

// Pantalla Auditoría de Priorización (FR7): registro inmutable, solo lectura.
// Lista como cards (default en mobile) o tabla, alternables con el toggle del
// header. En desktop es siempre tabla (ver useOmsView).
export default function OmsAuditoriaPage() {
  const country: Country = 'CR';
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState<string>('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'todos' | 'automatico' | 'manual'>('todos');
  const { view, setView } = useOmsView('cards');

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
      .catch(() => { if (!cancelled) setError('No se pudo cargar la auditoría.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const rows = entries.filter((e) => typeFilter === 'todos' || e.changeType === typeFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auditoría de Priorización</h1>
          <p className="text-sm text-slate-600 mt-1">
            Registro inmutable de cambios de prioridad (solo lectura)
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select
            label="Compañía"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
      </div>

      {!loading && !error && rows.length > 0 && (
        <div className="flex justify-end sm:hidden">
          <ViewToggle view={view} onChange={setView} />
        </div>
      )}

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

        {loading && (
          <div className="flex items-center justify-center h-48">
            <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
          </div>
        )}
        {!loading && error && <div className="p-6 text-sm text-red-600">{error}</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <i className="ri-history-line text-3xl"></i>
            <p className="mt-2 text-sm">No hay registros para estos criterios.</p>
          </div>
        )}

        {!loading && !error && rows.length > 0 && view === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Fecha</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Pedido</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Tipo</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Tier</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Score</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Actor</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm text-slate-500">{e.timestamp}</td>
                    <td className="py-3 px-4 text-sm font-medium text-slate-900">{e.orderId}</td>
                    <td className="py-3 px-4">
                      <Badge variant={e.changeType === 'manual' ? 'warning' : 'default'} size="sm">
                        {e.changeType === 'manual' ? 'Manual' : 'Automático'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">{tierChange(e)}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{e.scoreFrom ?? '—'} → {e.scoreTo}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{e.actor}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && rows.length > 0 && view === 'cards' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {rows.map((e) => (
              <div key={e.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-semibold text-slate-900">{e.orderId}</span>
                  <Badge variant={e.changeType === 'manual' ? 'warning' : 'default'} size="sm">
                    {e.changeType === 'manual' ? 'Manual' : 'Automático'}
                  </Badge>
                </div>
                <div className="text-sm space-y-1.5">
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Fecha</span><span className="text-slate-900 text-right">{e.timestamp}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Tier</span><span className="text-slate-900 text-right">{tierChange(e)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Score</span><span className="text-slate-900 text-right">{e.scoreFrom ?? '—'} → {e.scoreTo}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Actor</span><span className="text-slate-900 text-right truncate">{e.actor}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-slate-500">Detalle</span><span className="text-slate-900 text-right">{e.detail}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
