import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import { downloadCostTemplate } from '../../../components/tarifas/CostTemplateModal';
import { CostRowsTable, TruckSummaryTable } from '../../../components/tarifas/CostStructureParts';
import type { CostStructure, CostStructureRow } from '../../../lib/tarifas/types';
import type { TruckSummary } from '../../../lib/tarifas/costTemplate';

interface CostStructureCardProps {
  structure: CostStructure | null;
  structureRows: CostStructureRow[];
  summary: TruckSummary[];
  countryId: string;
  countryName: string | undefined;
  currency: string;
  canEdit: boolean;
  onUpload: () => void;
}

export function CostStructureCard({
  structure, structureRows, summary, countryId, countryName, currency, canEdit, onUpload,
}: CostStructureCardProps) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-slate-700">Estructura de costos de la flota propia (base de la liquidación)</h3>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={downloadCostTemplate}>
            <i className="ri-download-2-line mr-1"></i>Descargar plantilla
          </Button>
          <Button onClick={onUpload} disabled={!countryId || !canEdit} title={!canEdit ? 'Tu rol no puede editar costos' : undefined}>
            <i className="ri-file-upload-line mr-1"></i>Subir plantilla
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Costo de operar con camiones propios en {countryName ?? 'este país'}: lo fijo (conductor, depreciación)
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
            <div>
              <dt className="text-xs text-slate-500">Nombre</dt>
              <dd className="font-medium text-slate-800">{structure.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Días operativos por mes</dt>
              <dd className="font-medium text-slate-800">{structure.operatingDaysPerMonth}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Km por año</dt>
              <dd className="font-medium text-slate-800">{structure.params.kmPerYear ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Precio del combustible ({currency})</dt>
              <dd className="font-medium text-slate-800">{structure.params.fuelPrice ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Rendimiento (km/l)</dt>
              <dd className="font-medium text-slate-800">
                {Object.keys(structure.params.fuelEfficiency).length === 0
                  ? '—'
                  : Object.entries(structure.params.fuelEfficiency)
                    .map(([t, v]) => `${t}: ${v}`)
                    .join(' · ')}
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
  );
}
