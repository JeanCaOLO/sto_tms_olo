import Select from '../../../components/base/Select';
import Input from '../../../components/base/Input';
import type { Conductor, RutaTipo, Transportista, Vehiculo } from '../types';

interface Props {
  rutas: RutaTipo[];
  transportistas: Transportista[];
  conductores: Conductor[];
  vehiculos: Vehiculo[];
  rutaTypeId: string;
  transportistaId: string;
  conductorId: string;
  vehiculoId: string;
  fechaRuta: string;
  setRutaTypeId: (value: string) => void;
  setTransportistaId: (value: string) => void;
  setConductorId: (value: string) => void;
  setVehiculoId: (value: string) => void;
  setFechaRuta: (value: string) => void;
}

export default function RouteConfigForm({
  rutas, transportistas, conductores, vehiculos,
  rutaTypeId, transportistaId, conductorId, vehiculoId, fechaRuta,
  setRutaTypeId, setTransportistaId, setConductorId, setVehiculoId, setFechaRuta,
}: Props) {
  const conductoresFiltrados = transportistaId
    ? conductores.filter((c) => c.carrier_id === transportistaId)
    : conductores;

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      <Select
        label="Ruta"
        value={rutaTypeId}
        onChange={(e) => setRutaTypeId(e.target.value)}
        required
        options={[{ value: '', label: 'Seleccionar ruta' }, ...rutas.map((r) => ({ value: r.id, label: r.name }))]}
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
