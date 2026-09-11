import { useEffect, useState } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
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
        {!loading && !error && rows.length > 0 && (
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
                    <td className="py-3 px-4 text-sm text-slate-700">
                      {e.tierFrom === 'sin asignar' ? 'sin asignar' : TIER_LABEL[e.tierFrom]} → {TIER_LABEL[e.tierTo]}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">{e.scoreFrom ?? '—'} → {e.scoreTo}</td>
                    <td className="py-3 px-4 text-sm text-slate-700">{e.actor}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
