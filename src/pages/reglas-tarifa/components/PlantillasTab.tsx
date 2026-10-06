import { useState, useEffect } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import DataTable, { type DataTableColumn } from '../../../components/base/DataTable';
import HelpButton from './HelpButton';
import { deleteTemplate, listTemplates, saveTemplate } from '../../../lib/tarifas/localRulesDataSource';
import type { FleetType, ServiceType } from '../../../lib/tarifas/types';

interface PlantillasTabProps {
  organizationId: string;
  /** País activo del módulo. Las plantillas listadas y las nuevas son de este país. */
  countryId: string;
  zones: any[];
}

const emptyTrip = {
  countryId: '', originZoneId: '', destZoneId: '',
  km: 100, clientCount: 5, weightKg: 500,
  truckTypeId: 'CAMION-1', serviceType: 'STANDARD' as ServiceType, fleetType: 'OWN' as FleetType,
  carrierId: '', customerId: '', durationHours: 4,
};

export default function PlantillasTab({ organizationId, countryId, zones }: PlantillasTabProps) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id?: string; name: string; trip: typeof emptyTrip } | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setTemplates(await listTemplates(organizationId));
    } catch (e) {
      console.error('Error cargando plantillas:', e);
      setError('No se pudieron cargar las plantillas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const startNew = () => setEditing({ name: '', trip: { ...emptyTrip, countryId } });

  const startEdit = (t: any) => setEditing({
    id: t.id,
    name: t.name,
    trip: {
      countryId: t.country_id, originZoneId: t.trip?.originLocationId ?? '', destZoneId: t.trip?.destLocationId ?? '',
      km: t.trip?.km ?? 100, clientCount: t.trip?.clientCount ?? 5,
      weightKg: t.trip?.weightKg ?? 500, truckTypeId: t.trip?.truckTypeId ?? 'CAMION-1',
      serviceType: t.trip?.serviceType ?? 'STANDARD', fleetType: t.trip?.fleetType ?? 'OWN',
      carrierId: t.trip?.carrierId ?? '', customerId: t.trip?.customerId ?? '',
      durationHours: t.trip?.durationHours ?? 4,
    },
  });

  const handleSave = async () => {
    if (!editing || !editing.name.trim() || !editing.trip.countryId) return;
    const { trip, name } = editing;
    setError('');
    try {
      const { error: saveError } = await saveTemplate(organizationId, {
      country_id: trip.countryId,
      name: name.trim(),
      trip: {
        originLocationId: trip.originZoneId, destLocationId: trip.destZoneId,
        km: trip.km, clientCount: trip.clientCount, weightKg: trip.weightKg,
        truckTypeId: trip.truckTypeId, serviceType: trip.serviceType, fleetType: trip.fleetType,
        carrierId: trip.carrierId || null, customerId: trip.customerId || null,
        durationHours: trip.durationHours,
      },
    }, editing.id);
      if (saveError) throw saveError;
      setEditing(null);
      await load();
    } catch (e) {
      console.error('Error guardando plantilla:', e);
      setError('No se pudo guardar la plantilla.');
    }
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      const { error: deleteError } = await deleteTemplate(id);
      if (deleteError) throw deleteError;
      await load();
    } catch (e) {
      console.error('Error eliminando plantilla:', e);
      setError('No se pudo eliminar la plantilla.');
    }
  };

  const columns: DataTableColumn<any>[] = [
    { key: 'name', header: 'Nombre', accessor: (t) => t.name, sortable: true },
  ];

  const zonesForCountry = (id: string) => zones.filter((z) => z.country_id === id);

  // Acotadas al país activo: el ámbito del módulo es global, no por pestaña.
  const countryTemplates = templates.filter((t: any) => t.country_id === countryId);

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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <Card>
        <DataTable
          data={countryTemplates}
          columns={columns}
          getRowId={(t) => String(t.id)}
          loading={loading}
          searchPlaceholder="Buscar plantilla..."
          exportFileName="plantillas_de_viaje"
          columnsKey="tarifas.plantillas_de_viaje"
          emptyMessage="Sin plantillas guardadas."
          actions={(t) => (
            <>
              <button onClick={() => startEdit(t)} className="text-slate-500 hover:bg-slate-100 rounded-lg p-1" title="Editar"><i className="ri-edit-line"></i></button>
              <button onClick={() => void handleDelete(t.id)} className="text-red-500 hover:bg-red-50 rounded-lg p-1" title="Eliminar"><i className="ri-delete-bin-line"></i></button>
            </>
          )}
        />
      </Card>

      {editing && (
        <Card>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">{editing.id ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
          <div className="space-y-3">
            <Input label="Nombre" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ej: Ruta diaria Bodega → Norte" />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Zona origen" value={editing.trip.originZoneId} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, originZoneId: e.target.value } })} options={[{ value: '', label: 'Elegir...' }, ...zonesForCountry(countryId).map((z) => ({ value: z.id, label: z.code }))]} />
              <Select label="Zona destino" value={editing.trip.destZoneId} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, destZoneId: e.target.value } })} options={[{ value: '', label: 'Elegir...' }, ...zonesForCountry(countryId).map((z) => ({ value: z.id, label: z.code }))]} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Input label="Km" type="number" value={editing.trip.km} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, km: Number(e.target.value) } })} />
              <Input label="Paradas completadas" type="number" value={editing.trip.clientCount} onChange={(e) => setEditing({ ...editing, trip: { ...editing.trip, clientCount: Number(e.target.value) } })} />
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
