import { useEffect, useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import HelpButton from './HelpButton';
import ImportRatesModal from './ImportRatesModal';
import {
  listOutsourcedCostRates, listSimulatedCarriers,
  saveOutsourcedCostRate, deleteOutsourcedCostRate,
} from '../../../lib/tarifas/localRulesDataSource';
import { activeStructure, listRows } from '../../../lib/tarifas/costStructureDataSource';
import { summarize } from '../../../lib/tarifas/costTemplate';
import type { CostStructure, CostStructureRow } from '../../../lib/tarifas/types';
import CostTemplateModal, { downloadCostTemplate } from '../../../components/tarifas/CostTemplateModal';
import { CostRowsTable, TruckSummaryTable } from '../../../components/tarifas/CostStructureParts';
import { ensurePartyProfile } from '../../../lib/tarifas/partiesDataSource';
import { listTruckTypes, type TruckTypeOption } from '../../../lib/tarifas/vehiclesDataSource';

interface CostosTabProps {
  organizationId: string;
  /** País activo del módulo. Ya no se elige acá: el ámbito es global. */
  country: { id: string; name: string; local_currency?: string } | null;
}

const emptyOutsourcedForm = { carrierId: '', truckTypeId: '', flatRate: '0' };

// Costos: cuánto le cuesta a la empresa operar el viaje. Dos bloques:
//  - Flota propia del país: la estructura de costos por defecto (`partyId = null`), que se carga con
//    la plantilla de Excel. Una compañía con estructura propia (ficha de la compañía) manda sobre ella.
//  - Terceros: tarifa plana por transportista y tipo de camión.
// Se usa junto con el total liquidado para derivar el margen (pestaña Política de Margen).
export default function CostosTab({ organizationId, country }: CostosTabProps) {
  const countryId = country?.id ?? '';
  const [loading, setLoading] = useState(true);
  const [structure, setStructure] = useState<CostStructure | null>(null);
  const [structureRows, setStructureRows] = useState<CostStructureRow[]>([]);
  const [outsourcedRates, setOutsourcedRates] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [truckTypes, setTruckTypes] = useState<TruckTypeOption[]>([]);
  const [error, setError] = useState('');

  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [outsourcedForm, setOutsourcedForm] = useState(emptyOutsourcedForm);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [active, outsourced, testCarriers, trucks] = await Promise.all([
        countryId ? activeStructure(null, countryId) : Promise.resolve(null),
        listOutsourcedCostRates(organizationId),
        listSimulatedCarriers(organizationId),
        listTruckTypes(),
      ]);
      setStructure(active);
      setStructureRows(active ? await listRows(active.id) : []);
      setOutsourcedRates(outsourced);
      setCarriers(testCarriers);
      setTruckTypes(trucks);
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
  const countryOutsourcedRates = outsourcedRates.filter((r) => r.country_id === countryId);

  // Las tarifas de outsourcing cuelgan del PERFIL de cálculo (`party_id`), no del transportista.
  const carrierLabel = (partyId: string) => carriers.find((c) => c.party_id === partyId)?.name || partyId;
  const countryCarriers = carriers.filter((c) => !c.country_id || c.country_id === countryId);

  const handleAddOutsourced = async () => {
    if (!countryId || !outsourcedForm.carrierId || !outsourcedForm.truckTypeId) return;
    setError('');
    try {
      const carrier = carriers.find((c) => c.id === outsourcedForm.carrierId);
      let partyId: string | null = carrier?.party_id ?? null;
      if (!partyId) {
        const ensured = await ensurePartyProfile(outsourcedForm.carrierId);
        if (ensured.status === 'failed') throw new Error(ensured.error.message);
        partyId = ensured.partyId;
      }
      const { error: saveError } = await saveOutsourcedCostRate(organizationId, {
        country_id: countryId,
        carrier_id: partyId,
        truck_type_id: outsourcedForm.truckTypeId,
        flat_rate: outsourcedForm.flatRate,
      });
      if (saveError) throw saveError;
      setOutsourcedForm(emptyOutsourcedForm);
      await load();
    } catch (e) {
      console.error('Error guardando tarifa de outsourcing:', e);
      setError(`No se pudo guardar la tarifa: ${e instanceof Error ? e.message : 'error inesperado'}`);
    }
  };

  const handleDeleteOutsourced = async (id: string) => {
    setError('');
    try {
      const { error: deleteError } = await deleteOutsourcedCostRate(id);
      if (deleteError) throw deleteError;
      await load();
    } catch (e) {
      console.error('Error eliminando tarifa de outsourcing:', e);
      setError('No se pudo eliminar la tarifa.');
    }
  };

  const rateColumns: DataTableColumn<any>[] = [
    { key: 'carrier', header: 'Transportista', accessor: (r) => carrierLabel(r.carrier_id), sortable: true, filterable: true },
    { key: 'truck', header: 'Vehículo', accessor: (r) => r.truck_type_id, sortable: true, filterable: true },
    {
      key: 'rate', header: 'Tarifa', align: 'right', sortable: true,
      accessor: (r) => Number(r.flat_rate),
      render: (r) => <span>{r.flat_rate} {currency}</span>,
    },
  ];

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
          <h3 className="text-sm font-semibold text-slate-700">Costos de {country?.name ?? 'este país'}</h3>
          <HelpButton
            title="Costos"
            steps={[
              'Acá se carga lo que le cuesta a la empresa operar un viaje. Es costo interno: nunca se le cobra ni se le muestra al transportista; solo sirve para calcular el margen (pestaña Política de Margen).',
              'Flota propia: una estructura de costos por país, que se carga con la plantilla de Excel (variables por km, fijos mensuales y parámetros). Una compañía puede tener la suya propia desde su ficha en Compañías, y esa manda sobre la del país.',
              'Terceros: tarifa plana por transportista y tipo de camión — se busca por esa combinación exacta al liquidar.',
              'Esto NO es el Tarifario: el Tarifario es lo que se le paga o cobra por el servicio (por zona, tramo, etc.); los costos son lo que cuesta hacerlo.',
            ]}
          />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-semibold text-slate-700">Estructura de costos de la flota propia del país</h3>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={downloadCostTemplate}>
              <i className="ri-download-2-line mr-1"></i> Descargar plantilla
            </Button>
            <Button onClick={() => setIsTemplateOpen(true)} disabled={!countryId}>
              <i className="ri-file-upload-line mr-1"></i> Subir plantilla
            </Button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Costo de operar con camiones propios en {country?.name ?? 'este país'}: lo fijo (conductor, depreciación)
          se prorratea por día y lo variable (mantenimiento, llantas) por kilómetro. Se usa para el margen de toda
          compañía que no tenga estructura propia. A diferencia del Tarifario, no es lo que se paga ni se cobra: es lo que cuesta.
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

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Tarifa plana de terceros</h3>
          <Button variant="secondary" onClick={() => setIsImportOpen(true)} disabled={!countryId}>
            <i className="ri-file-upload-line mr-1"></i> Importar CSV o Excel
          </Button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Una tarifa por tipo de vehículo. Podés cargarlas de a una, o importar un archivo con dos
          columnas —tipo de vehículo y precio— para dar de alta varias de golpe.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-3">
          <Select
            label="Transportista"
            value={outsourcedForm.carrierId}
            onChange={(e) => setOutsourcedForm({ ...outsourcedForm, carrierId: e.target.value })}
            options={[{ value: '', label: 'Elegir...' }, ...countryCarriers.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <div>
            <Input label="Tipo de vehículo" value={outsourcedForm.truckTypeId} onChange={(e) => setOutsourcedForm({ ...outsourcedForm, truckTypeId: e.target.value })} placeholder="Ej: TT-350" list="costos-truck-types" />
            <datalist id="costos-truck-types">
              {truckTypes.map((t) => <option key={t.code} value={t.code} />)}
            </datalist>
          </div>
          <Input label="Tarifa plana" value={outsourcedForm.flatRate} onChange={(e) => setOutsourcedForm({ ...outsourcedForm, flatRate: e.target.value })} placeholder="420.00" />
          <Button variant="secondary" onClick={handleAddOutsourced}><i className="ri-add-line"></i>Agregar</Button>
        </div>
        <DataTable
          data={countryOutsourcedRates}
          columns={rateColumns}
          getRowId={(r) => String(r.id)}
          searchPlaceholder="Buscar tarifa..."
          exportFileName="tarifas_outsourcing"
          emptyMessage="Sin tarifas de outsourcing configuradas para este país."
          actions={(r) => (
            <button onClick={() => void handleDeleteOutsourced(r.id)} className="text-red-500 hover:bg-red-50 rounded-lg p-1" title="Eliminar">
              <i className="ri-delete-bin-line"></i>
            </button>
          )}
        />
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

      <ImportRatesModal
        isOpen={isImportOpen}
        organizationId={organizationId}
        countryId={countryId}
        countryName={country?.name ?? ''}
        currency={currency}
        carriers={countryCarriers.map((c) => ({ id: c.id, name: c.name, partyId: c.party_id ?? null }))}
        onClose={() => setIsImportOpen(false)}
        onImported={() => { void load(); }}
      />
    </div>
  );
}
