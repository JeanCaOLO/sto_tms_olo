import { useState, useEffect } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import Select from '../../../components/base/Select';
import HelpButton from './HelpButton';
import { listRules } from '../../../lib/tarifas/localRulesDataSource';
import { STAGE_ORDER } from '../../../lib/tarifas/types';

interface ResumenTabProps {
  organizationId: string;
  /** País activo del módulo. */
  countryId: string;
}

const STAGE_LABELS: Record<string, string> = {
  BASE: 'Base', VARIABLE: 'Variable', MODIFIER: 'Modificador',
  SURCHARGE: 'Recargo', ADJUSTMENT: 'Ajuste', TAX: 'Impuesto',
};

export default function ResumenTab({ organizationId, countryId }: ResumenTabProps) {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<any[]>([]);

  useEffect(() => {
    if (countryId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId, organizationId]);

  const load = async () => {
    setLoading(true);
    setRules(await listRules(organizationId));
    setLoading(false);
  };


  const activeRules = rules.filter((r) => r.active && (r.country_id === countryId || !r.country_id));

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

        </>
      )}
    </div>
  );
}
