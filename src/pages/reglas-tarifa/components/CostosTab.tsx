import { useEffect, useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import HelpButton from './HelpButton';
import {
  listOwnCostParams, listOutsourcedCostRates, listSimulatedCarriers,
  saveOwnCostParams, saveOutsourcedCostRate, deleteOutsourcedCostRate,
} from '../../../lib/tarifas/localRulesDataSource';

interface CostosTabProps {
  organizationId: string;
  countries: { id: string; name: string }[];
}

const emptyOwnForm = { cost_per_km: '0', depreciation_per_km: '0', driver_daily: '0' };
const emptyOutsourcedForm = { carrierId: '', truckTypeId: '', flatRate: '0' };

// Motor de costos (Fase 2): cuánto le cuesta a la empresa operar el viaje — flota propia (por km +
// depreciación + chofer por día) o tercerizada (tarifa plana por transportista/tipo de vehículo).
// Se usa junto con el total liquidado para derivar el margen (pestaña Política de Margen).
export default function CostosTab({ organizationId, countries }: CostosTabProps) {
  const [countryId, setCountryId] = useState(countries[0]?.id ?? '');
  const [loading, setLoading] = useState(true);
  const [ownParams, setOwnParams] = useState<any[]>([]);
  const [outsourcedRates, setOutsourcedRates] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);

  const [ownForm, setOwnForm] = useState(emptyOwnForm);
  const [ownSaving, setOwnSaving] = useState(false);
  const [outsourcedForm, setOutsourcedForm] = useState(emptyOutsourcedForm);

  const load = async () => {
    setLoading(true);
    const [own, outsourced, testCarriers] = await Promise.all([
      listOwnCostParams(organizationId),
      listOutsourcedCostRates(organizationId),
      listSimulatedCarriers(organizationId),
    ]);
    setOwnParams(own);
    setOutsourcedRates(outsourced);
    setCarriers(testCarriers);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    const current = ownParams.find((p) => p.country_id === countryId);
    setOwnForm(current
      ? { cost_per_km: String(current.cost_per_km), depreciation_per_km: String(current.depreciation_per_km), driver_daily: String(current.driver_daily) }
      : emptyOwnForm);
  }, [countryId, ownParams]);

  const currentOwnParams = ownParams.find((p) => p.country_id === countryId);
  const countryOutsourcedRates = outsourcedRates.filter((r) => r.country_id === countryId);

  const carrierLabel = (id: string) => carriers.find((c) => c.id === id)?.name || id;

  const handleSaveOwn = async () => {
    if (!countryId) return;
    setOwnSaving(true);
    await saveOwnCostParams(organizationId, {
      country_id: countryId,
      cost_per_km: ownForm.cost_per_km,
      depreciation_per_km: ownForm.depreciation_per_km,
      driver_daily: ownForm.driver_daily,
    }, currentOwnParams?.id);
    setOwnSaving(false);
    await load();
  };

  const handleAddOutsourced = async () => {
    if (!countryId || !outsourcedForm.carrierId || !outsourcedForm.truckTypeId) return;
    await saveOutsourcedCostRate(organizationId, {
      country_id: countryId,
      carrier_id: outsourcedForm.carrierId,
      truck_type_id: outsourcedForm.truckTypeId,
      flat_rate: outsourcedForm.flatRate,
    });
    setOutsourcedForm(emptyOutsourcedForm);
    await load();
  };

  if (loading) {
    return <Card><div className="text-center py-14 text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl"></i></div></Card>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-700">País</h3>
          <HelpButton
            title="Costos"
            steps={[
              'Flota propia: costo por km + depreciación por km + chofer por día (una fila por país).',
              'Tercerizada (outsourcing): tarifa plana por transportista y tipo de vehículo — se busca por esa combinación exacta al liquidar.',
              'Este costo nunca se le cobra ni se le muestra al transportista: solo se usa para calcular el margen (pestaña Política de Margen).',
            ]}
          />
        </div>
        <Select value={countryId} onChange={(e) => setCountryId(e.target.value)} options={countries.map((c) => ({ value: c.id, label: c.name }))} />
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
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Tercerizada (outsourcing) — tarifa plana</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-3">
          <Select
            label="Transportista"
            value={outsourcedForm.carrierId}
            onChange={(e) => setOutsourcedForm({ ...outsourcedForm, carrierId: e.target.value })}
            options={[{ value: '', label: 'Elegir...' }, ...carriers.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Input label="Tipo de vehículo" value={outsourcedForm.truckTypeId} onChange={(e) => setOutsourcedForm({ ...outsourcedForm, truckTypeId: e.target.value })} placeholder="Ej: TT-350" />
          <Input label="Tarifa plana" value={outsourcedForm.flatRate} onChange={(e) => setOutsourcedForm({ ...outsourcedForm, flatRate: e.target.value })} placeholder="420.00" />
          <Button variant="secondary" onClick={handleAddOutsourced}><i className="ri-add-line"></i>Agregar</Button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200"><th className="text-left py-2">Transportista</th><th className="text-left py-2">Vehículo</th><th className="text-left py-2">Tarifa</th><th></th></tr></thead>
          <tbody>
            {countryOutsourcedRates.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2">{carrierLabel(r.carrier_id)}</td>
                <td className="py-2">{r.truck_type_id}</td>
                <td className="py-2">${r.flat_rate}</td>
                <td className="py-2 text-right">
                  <button onClick={async () => { await deleteOutsourcedCostRate(r.id); await load(); }} className="text-red-500 hover:bg-red-50 rounded-lg p-1">
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </td>
              </tr>
            ))}
            {countryOutsourcedRates.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-slate-400">Sin tarifas de outsourcing configuradas para este país.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
