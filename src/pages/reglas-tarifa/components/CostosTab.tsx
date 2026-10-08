import { useEffect, useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import HelpButton from './HelpButton';
import { activeStructure, listRows } from '../../../lib/tarifas/costStructureDataSource';
import { summarize } from '../../../lib/tarifas/costTemplate';
import type { CostStructure, CostStructureRow } from '../../../lib/tarifas/types';
import CostTemplateModal, { downloadCostTemplate } from '../../../components/tarifas/CostTemplateModal';
import { CostRowsTable, TruckSummaryTable } from '../../../components/tarifas/CostStructureParts';
import { useModulePermissions } from '../../../hooks/use-module-permissions';

interface CostosTabProps {
  organizationId: string;
  /** País activo del módulo. Ya no se elige acá: el ámbito es global. */
  country: { id: string; name: string; local_currency?: string } | null;
}

// Costos de la flota propia: la estructura de costos por defecto del país (`partyId = null`), que se
// carga con la plantilla de Excel. Es la BASE de lo que se paga por un viaje de flota propia (se acumula
// y es lo que se liquida y se envía a cuentas por pagar). Una compañía con estructura propia (ficha de
// la compañía) manda sobre ella. Los terceros no tienen costos propios: se les paga por reglas/tarifarios.
export default function CostosTab({ organizationId, country }: CostosTabProps) {
  const { canEdit } = useModulePermissions('tarifas.config');
  const countryId = country?.id ?? '';
  const [loading, setLoading] = useState(true);
  const [structure, setStructure] = useState<CostStructure | null>(null);
  const [structureRows, setStructureRows] = useState<CostStructureRow[]>([]);
  const [error, setError] = useState('');

  const [isTemplateOpen, setIsTemplateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const active = countryId ? await activeStructure(null, countryId) : null;
      setStructure(active);
      setStructureRows(active ? await listRows(active.id) : []);
    } catch (e) {
      console.error('Error cargando costos:', e);
      setError('No se pudieron cargar los costos. Reintentá en unos segundos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, countryId]);

  const currency = country?.local_currency ?? 'moneda local';

  const summary = structure
    ? summarize(structureRows.filter((r) => r.active), structure.params, structure.operatingDaysPerMonth)
    : [];

  if (loading) {
    return <Card><div className="text-center py-14 text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl"></i></div></Card>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}
      <Card>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Costos de la flota propia en {country?.name ?? 'este país'}</h3>
          <HelpButton
            title="Costos"
            steps={[
              'Acá se carga la estructura de costos de la flota propia. Es la BASE de lo que se paga por un viaje de flota propia: sus gastos se acumulan, y eso es lo que se liquida y se envía a cuentas por pagar. Es costo interno: nunca se le muestra a un transportista tercero.',
              'Se carga con la plantilla de Excel (variables por km, fijos mensuales y parámetros). Una compañía puede tener la suya propia desde su ficha en Compañías, y esa manda sobre la del país.',
              'Las reglas y los tarifarios solo ajustan encima de esta base (recargos, descuentos, topes).',
              'Para terceros no hay costos propios: se les paga lo que dicen las reglas y los tarifarios.',
            ]}
          />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-slate-700">Estructura de costos de la flota propia (base de la liquidación)</h3>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={downloadCostTemplate}>
              <i className="ri-download-2-line mr-1"></i> Descargar plantilla
            </Button>
            <Button onClick={() => setIsTemplateOpen(true)} disabled={!countryId || !canEdit} title={!canEdit ? 'Tu rol no puede editar costos' : undefined}>
              <i className="ri-file-upload-line mr-1"></i> Subir plantilla
            </Button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Costo de operar con camiones propios en {country?.name ?? 'este país'}: lo fijo (conductor, depreciación)
          se prorratea por día y lo variable (mantenimiento, llantas) por kilómetro. Es la base de lo que se
          liquida por cada viaje de flota propia, para toda compañía que no tenga estructura propia; las reglas y los
          tarifarios solo ajustan encima.
        </p>

        {!structure ? (
          <p className="text-xs text-amber-600">
            Sin estructura cargada: una liquidación de flota propia para este país no se puede calcular. Descargá la plantilla, llenala y subila.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm mb-4">
              <div><dt className="text-xs text-slate-500">Nombre</dt><dd className="font-medium text-slate-800">{structure.name}</dd></div>
              <div><dt className="text-xs text-slate-500">Días operativos por mes</dt><dd className="font-medium text-slate-800">{structure.operatingDaysPerMonth}</dd></div>
              <div><dt className="text-xs text-slate-500">Km por año</dt><dd className="font-medium text-slate-800">{structure.params.kmPerYear ?? '—'}</dd></div>
              <div><dt className="text-xs text-slate-500">Precio del combustible ({currency})</dt><dd className="font-medium text-slate-800">{structure.params.fuelPrice ?? '—'}</dd></div>
              <div>
                <dt className="text-xs text-slate-500">Rendimiento (km/l)</dt>
                <dd className="font-medium text-slate-800">
                  {Object.keys(structure.params.fuelEfficiency).length === 0
                    ? '—'
                    : Object.entries(structure.params.fuelEfficiency).map(([t, v]) => `${t}: ${v}`).join(' · ')}
                </dd>
              </div>
            </dl>

            <CostRowsTable
              rows={structureRows}
              exportFileName="estructura_costos_flota_propia"
              emptyMessage="La estructura no tiene filas."
            />

            {summary.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Resumen por tipo de camión ({currency})</h4>
                <TruckSummaryTable summary={summary} exportFileName="resumen_costos_por_camion" />
              </div>
            )}
          </>
        )}
      </Card>

      <CostTemplateModal
        isOpen={isTemplateOpen}
        partyId={null}
        countryId={countryId}
        structureName={structure?.name ?? `Flota propia ${country?.name ?? ''}`.trim()}
        scopeLabel={`la estructura de la flota propia de ${country?.name ?? 'este país'}`}
        currency={country?.local_currency}
        onClose={() => setIsTemplateOpen(false)}
        onApplied={() => { void load(); }}
      />
    </div>
  );
}
