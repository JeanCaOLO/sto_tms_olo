import Select from '../../../components/base/Select';
import Input from '../../../components/base/Input';
import type { Conductor, Transportista, Vehiculo, Viaje } from '../types';

interface Props {
  viajes: Viaje[];
  transportistas: Transportista[];
  conductores: Conductor[];
  vehiculos: Vehiculo[];
  viajeId: string;
  rutaNombre: string;
  transportistaId: string;
  conductorId: string;
  vehiculoId: string;
  fechaRuta: string;
  setViajeId: (value: string) => void;
  setTransportistaId: (value: string) => void;
  setConductorId: (value: string) => void;
  setVehiculoId: (value: string) => void;
  setFechaRuta: (value: string) => void;
}

export default function RouteConfigForm({
  viajes, transportistas, conductores, vehiculos,
  viajeId, rutaNombre, transportistaId, conductorId, vehiculoId, fechaRuta,
  setViajeId, setTransportistaId, setConductorId, setVehiculoId, setFechaRuta,
}: Props) {
  const conductoresFiltrados = transportistaId
    ? conductores.filter((c) => c.carrier_id === transportistaId)
    : conductores;

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
      <Select
        label="Viaje (WMS)"
        value={viajeId}
        onChange={(e) => setViajeId(e.target.value)}
        required
        options={[
          { value: '', label: 'Seleccionar viaje despachado' },
          ...viajes.map((v) => ({ value: v.id, label: v.trip_number })),
        ]}
      />
      <Input
        label="Ruta"
        value={rutaNombre}
        readOnly
        placeholder="La define el viaje"
        className="bg-slate-50 text-slate-500 cursor-not-allowed"
        title="Asignada por el WMS al viaje — no se edita aquí"
      />
      <Select
        label="Transportista"
        value={transportistaId}
        onChange={(e) => setTransportistaId(e.target.value)}
        options={[{ value: '', label: 'Todos' }, ...transportistas.map((t) => ({ value: t.id, label: t.name }))]}
      />
      <Select
        label="Conductor"
        value={conductorId}
        onChange={(e) => setConductorId(e.target.value)}
        required
        options={[
          { value: '', label: conductoresFiltrados.length === 0 ? 'Sin conductores' : 'Seleccionar conductor' },
          ...conductoresFiltrados.map((c) => ({ value: c.id, label: `${c.full_name} - ${c.document}` })),
        ]}
      />
      <Select
        label="Vehículo"
        value={vehiculoId}
        onChange={(e) => setVehiculoId(e.target.value)}
        required
        options={[{ value: '', label: 'Seleccionar vehículo' }, ...vehiculos.map((v) => ({ value: v.id, label: `${v.plate} - ${v.brand} ${v.model}` }))]}
      />
      <Input type="date" label="Fecha de Ruta" value={fechaRuta} onChange={(e) => setFechaRuta(e.target.value)} required />
    </div>
  );
}
