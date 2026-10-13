import type { Dispatch, SetStateAction } from 'react';
import Input from '../../../../components/base/Input';
import Select from '../../../../components/base/Select';
import type { TruckTypeOption } from '../../../../lib/tarifas/vehiclesDataSource';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';
import type { FleetType, ServiceType, Zone } from '../../../../lib/tarifas/types';
import type { DatosDelDia, ViajeLibre } from './testerTypes';

interface Props {
  libre: ViajeLibre;
  setLibre: Dispatch<SetStateAction<ViajeLibre>>;
  dia: DatosDelDia;
  setDia: Dispatch<SetStateAction<DatosDelDia>>;
  carriers: CarrierProfile[];
  zones: Zone[];
  truckTypes: TruckTypeOption[];
  libreCarrier: CarrierProfile | null;
}

const SERVICE_OPTIONS = [
  { value: 'STANDARD', label: 'Estándar' },
  { value: 'EXPRESS', label: 'Express' },
  { value: 'DEDICATED', label: 'Dedicado' },
];

/** Modo "viaje libre": todo lo que un viaje real aportaría se teclea a mano. */
export default function FreeTripPanel({ libre, setLibre, dia, setDia, carriers, zones, truckTypes, libreCarrier }: Props) {
  const zoneOptions = zones.map((z) => ({ value: z.id, label: `${z.code} — ${z.name}` }));
  return (
    <>
      <Select
        label="Compañía (opcional)"
        value={libre.carrierId}
        onChange={(e) => setLibre({ ...libre, carrierId: e.target.value })}
        options={[
          { value: '', label: 'Sin compañía (solo reglas del país)' },
          ...carriers.map((c) => ({
            value: c.carrierId,
            label: `${c.name} · ${c.classification === 'OWN' ? 'flota propia' : 'tercero'}`,
          })),
        ]}
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Zona origen"
          value={libre.originZoneId}
          onChange={(e) => setLibre({ ...libre, originZoneId: e.target.value })}
          options={zoneOptions}
        />
        <Select
          label="Zona destino"
          value={libre.destZoneId}
          onChange={(e) => setLibre({ ...libre, destZoneId: e.target.value })}
          options={zoneOptions}
        />
      </div>

      {zones.length === 0 && (
        <p className="text-xs text-amber-600">
          No hay zonas en este país — se dan de alta en Catálogos, o ninguna regla por zona
          podrá aplicar.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Input label="Km" type="number" value={libre.km} onChange={(e) => setLibre({ ...libre, km: e.target.value })} />
        <Input label="Paradas completadas" type="number" value={libre.clientCount} onChange={(e) => setLibre({ ...libre, clientCount: e.target.value })} />
        <Input label="Peso (kg)" type="number" value={libre.weightKg} onChange={(e) => setLibre({ ...libre, weightKg: e.target.value })} />
        <Input label="Duración (h)" type="number" value={libre.durationHours} onChange={(e) => setLibre({ ...libre, durationHours: e.target.value })} />
        <div>
          <Input
            label="Tipo de camión"
            value={libre.truckTypeId}
            onChange={(e) => setLibre({ ...libre, truckTypeId: e.target.value })}
            list="probador-truck-types"
          />
          <datalist id="probador-truck-types">
            {truckTypes.map((t) => <option key={t.code} value={t.code} />)}
          </datalist>
        </div>
        <Input label="Volumen (m³)" type="number" value={libre.truckVolumeM3} onChange={(e) => setLibre({ ...libre, truckVolumeM3: e.target.value })} />
        <Input label="Capacidad (t)" type="number" value={libre.truckWeightTons} onChange={(e) => setLibre({ ...libre, truckWeightTons: e.target.value })} />
        <Input label="Cliente (id libre)" value={libre.customerId} onChange={(e) => setLibre({ ...libre, customerId: e.target.value })} />
      </div>

      {!libreCarrier && (
        <Select
          label="Flota"
          value={libre.fleetType}
          onChange={(e) => setLibre({ ...libre, fleetType: e.target.value as FleetType })}
          options={[{ value: 'OWN', label: 'Propia' }, { value: 'OUTSOURCED', label: 'Tercerizada' }]}
        />
      )}
      {libreCarrier && (
        <p className="text-[11px] text-slate-400">
          La flota la define el transportista elegido, no se teclea: es su única fuente de verdad.
        </p>
      )}

      <div className="border-t border-slate-200 pt-3">
        <p className="text-[11px] text-slate-500 uppercase font-medium mb-2">Lo del día</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Input label="Fecha" type="date" value={dia.quotedAt} onChange={(e) => setDia({ ...dia, quotedAt: e.target.value })} />
          <Select
            label="Servicio"
            value={dia.serviceType}
            onChange={(e) => setDia({ ...dia, serviceType: e.target.value as ServiceType })}
            options={SERVICE_OPTIONS}
          />
        </div>
      </div>
    </>
  );
}
