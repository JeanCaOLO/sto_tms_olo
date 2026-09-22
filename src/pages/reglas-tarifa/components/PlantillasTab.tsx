import { useState, useEffect } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import HelpButton from './HelpButton';
import { deleteTemplate, listTemplates, saveTemplate } from '../../../lib/tarifas/localRulesDataSource';
import type { FleetType, ServiceType } from '../../../lib/tarifas/types';

interface PlantillasTabProps {
  organizationId: string;
  countries: { id: string; name: string }[];
  zones: any[];
}

const emptyTrip = {
  countryId: '', originZoneId: '', destZoneId: '',
  km: 100, clientCount: 5, packageCount: 20, weightKg: 500,
  truckTypeId: 'CAMION-1', serviceType: 'STANDARD' as ServiceType, fleetType: 'OWN' as FleetType,
  carrierId: '', customerId: '', durationHours: 4, tollsAmount: '0', lateMinutes: 0, incidentCount: 0,
};

export default function PlantillasTab({ organizationId, countries, zones }: PlantillasTabProps) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id?: string; name: string; trip: typeof emptyTrip } | null>(null);

  const load = async () => {
    setLoading(true);
    setTemplates(await listTemplates(organizationId));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const startNew = () => setEditing({ name: '', trip: { ...emptyTrip, countryId: countries[0]?.id ?? '' } });

  const startEdit = (t: any) => setEditing({
    id: t.id,
    name: t.name,
    trip: {
      countryId: t.country_id, originZoneId: t.trip?.originLocationId ?? '', destZoneId: t.trip?.destLocationId ?? '',
      km: t.trip?.km ?? 100, clientCount: t.trip?.clientCount ?? 5, packageCount: t.trip?.packageCount ?? 20,
      weightKg: t.trip?.weightKg ?? 500, truckTypeId: t.trip?.truckTypeId ?? 'CAMION-1',
      serviceType: t.trip?.serviceType ?? 'STANDARD', fleetType: t.trip?.fleetType ?? 'OWN',
      carrierId: t.trip?.carrierId ?? '', customerId: t.trip?.customerId ?? '',
      durationHours: t.trip?.durationHours ?? 4, tollsAmount: t.trip?.tollsAmount ?? '0',
      lateMinutes: t.trip?.lateMinutes ?? 0, incidentCount: t.trip?.incidentCount ?? 0,
    },
  });

  const handleSave = async () => {
    if (!editing || !editing.name.trim() || !editing.trip.countryId) return;
    const { trip, name } = editing;
    await saveTemplate(organizationId, {
      country_id: trip.countryId,
      name: name.trim(),
      trip: {
        originLocationId: trip.originZoneId, destLocationId: trip.destZoneId,
        km: trip.km, clientCount: trip.clientCount, packageCount: trip.packageCount, weightKg: trip.weightKg,
        truckTypeId: trip.truckTypeId, serviceType: trip.serviceType, fleetType: trip.fleetType,
        carrierId: trip.carrierId || null, customerId: trip.customerId || null,
        durationHours: trip.durationHours, tollsAmount: trip.tollsAmount,
        lateMinutes: trip.lateMinutes, incidentCount: trip.incidentCount,
      },
    }, editing.id);
    setEditing(null);
    await load();
  };

  const zonesForCountry = (countryId: string) => zones.filter((z) => z.country_id === countryId);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700">Plantillas de viaje frecuente</h3>
            <HelpButton
              title="Plantillas"
              steps={[
                'Guardan los datos de un viaje típico (zona, km, tipo de vehículo, flota, etc.) con un nombre.',
                'En el Probador del motor podés elegir "Cargar plantilla" para completar el formulario automáticamente en vez de tipear todo de nuevo.',
                'Sirven para viajes que se repiten seguido, por ejemplo una ruta fija diaria con el mismo transportista.',
              ]}
            />
          </div>
          <Button onClick={startNew}><i className="ri-add-line mr-2"></i>Nueva plantilla</Button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="text-center py-10 text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl"></i></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200"><th className="text-left py-2">Nombre</th><th className="text-left py-2">País</th><th></th></tr></thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-2 text-slate-800">{t.name}</td>
                  <td className="py-2 text-slate-500">{countries.find((c) => c.id === t.country_id)?.name ?? t.country_id}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => startEdit(t)} className="text-slate-500 hover:bg-slate-100 rounded-lg p-1 mr-1"><i className="ri-edit-line"></i></button>
                    <button onClick={async () => { await deleteTemplate(t.id); await load(); }} className="text-red-500 hover:bg-red-50 rounded-lg p-1"><i className="ri-delete-bin-line"></i></button>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-400">Sin plantillas guardadas.</td></tr>}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">{editing.id ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
          <div className="space-y-3">
            <Input label="Nombre" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ej: Ruta diaria Bodega → Norte" />
            <Select
              label="País"
              value={editing.trip.countryId}
              onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, countryId: e.target.value, originZoneId: '', destZoneId: '' } })}
              options={countries.map((c) => ({ value: c.id, label: c.name }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Zona origen" value={editing.trip.originZoneId} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, originZoneId: e.target.value } })} options={[{ value: '', label: 'Elegir...' }, ...zonesForCountry(editing.trip.countryId).map((z) => ({ value: z.id, label: z.code }))]} />
              <Select label="Zona destino" value={editing.trip.destZoneId} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, destZoneId: e.target.value } })} options={[{ value: '', label: 'Elegir...' }, ...zonesForCountry(editing.trip.countryId).map((z) => ({ value: z.id, label: z.code }))]} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input label="Km" type="number" value={editing.trip.km} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, km: Number(e.target.value) } })} />
              <Input label="Paradas" type="number" value={editing.trip.clientCount} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, clientCount: Number(e.target.value) } })} />
              <Input label="Entregas" type="number" value={editing.trip.packageCount} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, packageCount: Number(e.target.value) } })} />
              <Input label="Peso (kg)" type="number" value={editing.trip.weightKg} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, weightKg: Number(e.target.value) } })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Tipo de servicio" value={editing.trip.serviceType} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, serviceType: e.target.value as ServiceType } })} options={[{ value: 'STANDARD', label: 'Estándar' }, { value: 'EXPRESS', label: 'Express' }, { value: 'DEDICATED', label: 'Dedicado' }]} />
              <Select label="Flota" value={editing.trip.fleetType} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, fleetType: e.target.value as FleetType } })} options={[{ value: 'OWN', label: 'Propia' }, { value: 'OUTSOURCED', label: 'Tercerizada' }]} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tipo de vehículo" value={editing.trip.truckTypeId} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, truckTypeId: e.target.value } })} />
              <Input label="Transportista (si es tercerizada)" value={editing.trip.carrierId} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, carrierId: e.target.value } })} />
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={!editing.name.trim() || !editing.trip.countryId}>Guardar</Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
