import { useState, useEffect } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import Select from '../../../components/base/Select';
import HelpButton from './HelpButton';
import { listFxRates, listRules, listZoneLaneRates } from '../../../lib/tarifas/localRulesDataSource';
import { STAGE_ORDER } from '../../../lib/tarifas/types';

interface ResumenTabProps {
  organizationId: string;
  countries: { id: string; name: string }[];
  zones: any[];
}

const STAGE_LABELS: Record<string, string> = {
  BASE: 'Base', VARIABLE: 'Variable', MODIFIER: 'Modificador',
  SURCHARGE: 'Recargo', ADJUSTMENT: 'Ajuste', TAX: 'Impuesto',
};

export default function ResumenTab({ organizationId, countries, zones }: ResumenTabProps) {
  const [countryId, setCountryId] = useState(countries[0]?.id ?? '');
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<any[]>([]);
  const [zoneLaneRates, setZoneLaneRates] = useState<any[]>([]);
  const [fxRates, setFxRates] = useState<any[]>([]);

  useEffect(() => {
    if (countryId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId, organizationId]);

  const load = async () => {
    setLoading(true);
    const [r, zlr, fx] = await Promise.all([
      listRules(organizationId), listZoneLaneRates(organizationId), listFxRates(organizationId),
    ]);
    setRules(r); setZoneLaneRates(zlr); setFxRates(fx);
    setLoading(false);
  };

  const zoneLabel = (id: string) => {
    const z = zones.find((zone) => zone.id === id);
    return z ? `${z.code} - ${z.name}` : id;
  };

  const activeRules = rules.filter((r) => r.active && (r.country_id === countryId || !r.country_id));
  const countryZoneLaneRates = zoneLaneRates.filter((r) => r.country_id === countryId);
  const countryFxRates = fxRates.filter((r) => r.country_id === countryId);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Resumen — todo lo configurado, en un solo lugar</h3>
          <HelpButton
            title="Resumen"
            steps={[
              'Vista de solo lectura: junta reglas activas, tarifas por zona y tasas de cambio para no tener que abrir cada pestaña por separado.',
              'Sirve para auditar rápido: "¿qué reglas de liquidación están activas ahora mismo?".',
            ]}
          />
        </div>
        <Select value={countryId} onChange={(e) => setCountryId(e.target.value)} options={countries.map((c) => ({ value: c.id, label: c.name }))} />
      </Card>

      {loading ? (
        <div className="text-center py-10 text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl"></i></div>
      ) : (
        <>
          <Card>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Reglas activas (lo que se le liquida al transportista)</h3>
            {STAGE_ORDER.map((stage) => {
              const inStage = activeRules.filter((r) => r.stage === stage).sort((a, b) => a.priority - b.priority);
              if (inStage.length === 0) return null;
              return (
                <div key={stage} className="mb-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{STAGE_LABELS[stage]}</h4>
                  <table className="w-full text-sm">
                    <tbody>
                      {inStage.map((rule) => (
                        <tr key={rule.id} className="border-b border-slate-100">
                          <td className="py-1.5">
                            <span className="text-slate-800">{rule.name}</span>
                            <span className="text-xs text-slate-400 ml-1">({rule.code})</span>
                          </td>
                          <td className="py-1.5"><Badge variant={rule.stacking === 'EXCLUSIVE' ? 'warning' : rule.stacking === 'MAX' ? 'info' : 'default'}>{rule.stacking}</Badge></td>
                          <td className="py-1.5 text-right text-xs text-slate-500">{rule.expression?.op}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
            {activeRules.length === 0 && <p className="text-sm text-slate-400">No hay reglas activas.</p>}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Tarifas por zona (LOOKUP_ZONE)</h3>
            <table className="w-full text-sm">
              <tbody>
                {countryZoneLaneRates.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-1.5">{zoneLabel(r.origin_zone_id)} → {zoneLabel(r.dest_zone_id)}</td>
                    <td className="py-1.5 text-right">${r.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {countryZoneLaneRates.length === 0 && <p className="text-sm text-slate-400">No hay tarifas por zona configuradas.</p>}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Tasas de cambio</h3>
            <table className="w-full text-sm">
              <tbody>
                {countryFxRates.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-1.5">{r.from_currency} → {r.to_currency}</td>
                    <td className="py-1.5 text-right">{r.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {countryFxRates.length === 0 && <p className="text-sm text-slate-400">No hay tasas de cambio configuradas.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
