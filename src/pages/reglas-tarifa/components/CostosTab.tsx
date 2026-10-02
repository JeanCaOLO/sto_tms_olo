import { useEffect, useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import HelpButton from './HelpButton';
import ImportRatesModal from './ImportRatesModal';
import {
  listOwnCostParams, listOutsourcedCostRates, listSimulatedCarriers,
  saveOwnCostParams, saveOutsourcedCostRate, deleteOutsourcedCostRate,
} from '../../../lib/tarifas/localRulesDataSource';
import { ensurePartyProfile } from '../../../lib/tarifas/partiesDataSource';
import { listTruckTypes, type TruckTypeOption } from '../../../lib/tarifas/vehiclesDataSource';

interface CostosTabProps {
  organizationId: string;
  /** País activo del módulo. Ya no se elige acá: el ámbito es global. */
  country: { id: string; name: string; local_currency?: string } | null;
}

// Por defecto 'REF', que es cómo se interpretaban los importes antes de que el campo existiera.
const emptyOwnForm = { cost_per_km: '0', depreciation_per_km: '0', driver_daily: '0' };
const emptyOutsourcedForm = { carrierId: '', truckTypeId: '', flatRate: '0' };

// Motor de costos (Fase 2): cuánto le cuesta a la empresa operar el viaje — flota propia (por km +
// depreciación + chofer por día) o tercerizada (tarifa plana por transportista/tipo de vehículo).
// Se usa junto con el total liquidado para derivar el margen (pestaña Política de Margen).
export default function CostosTab({ organizationId, country }: CostosTabProps) {
  const countryId = country?.id ?? '';
  const [loading, setLoading] = useState(true);
  const [ownParams, setOwnParams] = useState<any[]>([]);
  const [outsourcedRates, setOutsourcedRates] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [truckTypes, setTruckTypes] = useState<TruckTypeOption[]>([]);
  const [error, setError] = useState('');

  const [ownForm, setOwnForm] = useState(emptyOwnForm);
  const [ownSaving, setOwnSaving] = useState(false);
  const [outsourcedForm, setOutsourcedForm] = useState(emptyOutsourcedForm);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [own, outsourced, testCarriers, trucks] = await Promise.all([
        listOwnCostParams(organizationId),
        listOutsourcedCostRates(organizationId),
        listSimulatedCarriers(organizationId),
        listTruckTypes(),
      ]);
      setOwnParams(own);
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
  }, [organizationId]);

  useEffect(() => {
    const current = ownParams.find((p) => p.country_id === countryId);
    setOwnForm(current
      ? {
          cost_per_km: String(current.cost_per_km),
          depreciation_per_km: String(current.depreciation_per_km),
          driver_daily: String(current.driver_daily),
        }
      : emptyOwnForm);
  }, [countryId, ownParams]);

  const currency = country?.local_currency ?? 'moneda local';
  // Un importe de costo puede estar escrito en cualquiera de las dos monedas; el motor lo lleva a
  // la local antes de compararlo contra el total liquidado. Declararlo evita el error clásico de
  // cargar colones donde el sistema esperaba dólares.

  const currentOwnParams = ownParams.find((p) => p.country_id === countryId);
  const countryOutsourcedRates = outsourcedRates.filter((r) => r.country_id === countryId);

  // Las tarifas de outsourcing cuelgan del PERFIL de cálculo (`party_id`), no del transportista.
  const carrierLabel = (partyId: string) => carriers.find((c) => c.party_id === partyId)?.name || partyId;
  const countryCarriers = carriers.filter((c) => !c.country_id || c.country_id === countryId);

  const handleSaveOwn = async () => {
    if (!countryId) return;
    setOwnSaving(true);
    setError('');
    try {
      const { error: saveError } = await saveOwnCostParams(organizationId, {
        country_id: countryId,
        cost_per_km: ownForm.cost_per_km,
        depreciation_per_km: ownForm.depreciation_per_km,
        driver_daily: ownForm.driver_daily,
      }, currentOwnParams?.id);
      if (saveError) throw saveError;
      await load();
    } catch (e) {
      console.error('Error guardando costos de flota propia:', e);
      setError('No se pudieron guardar los costos de flota propia.');
    } finally {
      setOwnSaving(false);
    }
  };

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
              'Flota propia: costo por km + depreciación por km + chofer por día (una fila por país).',
              'Tercerizada (outsourcing): tarifa plana por transportista y tipo de vehículo — se busca por esa combinación exacta al liquidar.',
              'Este costo nunca se le cobra ni se le muestra al transportista: solo se usa para calcular el margen (pestaña Política de Margen).',
              'Moneda: indicá en cuál escribiste cada importe. El motor lo convierte a la moneda local del país antes de compararlo contra el total liquidado, así el margen nunca compara monedas distintas.',
            ]}
          />
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Flota propia</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Input label="Costo por km" value={ownForm.cost_per_km} onChange={(e) => setOwnForm({ ...ownForm, cost_per_km: e.target.value })} placeholder="1.10" />
          <Input label="Depreciación por km" value={ownForm.depreciation_per_km} onChange={(e) => setOwnForm({ ...ownForm, depreciation_per_km: e.target.value })} placeholder="0.18" />
          <Input label="Chofer por día" value={ownForm.driver_daily} onChange={(e) => setOwnForm({ ...ownForm, driver_daily: e.target.value })} placeholder="35.00" />
          <Button onClick={handleSaveOwn} disabled={ownSaving || !countryId}>
            {ownSaving ? 'Guardando...' : currentOwnParams ? 'Actualizar' : 'Guardar'}
          </Button>
        </div>
        {!currentOwnParams && (
          <p className="text-xs text-amber-600 mt-2">
            Sin esto configurado, una liquidación de flota propia para este país no se puede calcular.
          </p>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Tercerizada (outsourcing) — tarifa plana</h3>
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
