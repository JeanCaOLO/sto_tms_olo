import { useState, useEffect } from 'react';
import Card from '../../../components/base/Card';
import Badge from '../../../components/base/Badge';
import Select from '../../../components/base/Select';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
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
  const tableRules = [...activeRules].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.priority - b.priority,
  );

  const columns: DataTableColumn<any>[] = [
    {
      key: 'stage', header: 'Etapa', sortable: true, filterable: true,
      accessor: (r) => STAGE_LABELS[r.stage] ?? r.stage,
    },
    {
      key: 'name', header: 'Regla', sortable: true,
      accessor: (r) => r.name,
      render: (r) => (
        <span>
          <span className="text-slate-800">{r.name}</span>
          <span className="text-xs text-slate-400 ml-1">({r.code})</span>
        </span>
      ),
      exportValue: (r) => `${r.name} (${r.code})`,
    },
    {
      key: 'stacking', header: 'Acumulación', filterable: true,
      accessor: (r) => r.stacking,
      render: (r) => <Badge variant={r.stacking === 'EXCLUSIVE' ? 'warning' : r.stacking === 'MAX' ? 'info' : 'default'}>{r.stacking}</Badge>,
    },
    {
      key: 'op', header: 'Operación', filterable: true,
      accessor: (r) => r.expression?.op ?? '',
      cellClassName: 'text-xs text-slate-500',
    },
  ];

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
            <DataTable
              data={tableRules}
              columns={columns}
              getRowId={(r) => String(r.id)}
              searchPlaceholder="Buscar por regla o código"
              exportFileName="resumen_reglas_activas"
              columnsKey="tarifas.resumen_reglas_activas"
              emptyMessage="No hay reglas activas."
            />
          </Card>

        </>
      )}
    </div>
  );
}
