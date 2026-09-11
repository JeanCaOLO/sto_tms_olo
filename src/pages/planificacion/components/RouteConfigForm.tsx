import Select from '../../../components/base/Select';
import Input from '../../../components/base/Input';
import type { Conductor, Transportista, Vehiculo, Viaje } from '../types';
import { useCofersaDias } from '../route-systems/use-cofersa-dias';
import { rutasActivas, type DiaSemana } from '../route-systems/cofersa-dias';

// getDay() (0=domingo) → clave del calendario COFERSA. Domingo no tiene día
// laborable COFERSA (índice -1 → sin coincidencias).
const DIA_POR_GETDAY: Record<number, DiaSemana | undefined> = {
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
};
const NOMBRE_DIA: Record<DiaSemana, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
};
const NOMBRE_DOMINGO = 'Domingo';

/**
 * Número de ruta del viaje, para cruzar con el calendario COFERSA.
 * - Datos reales de EFLOW: el id viene como `eflow-rt-11` → 11.
 * - Catálogo mock: el id es un UUID, el número está en el nombre
 *   (`"01 · Casco Central"` → 1).
 */
function numeroRuta(viaje: Viaje): number {
  const deId = viaje.route_type_id?.match(/^eflow-rt-(\d+)/);
  return parseInt(deId ? deId[1] : (viaje.route_type_name ?? ''), 10);
}

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

  const { data: cofersa, status: cofersaStatus } = useCofersaDias();

  // Día de la semana elegido en "Fecha de Ruta" (getDay 0=domingo). 'T00:00'
  // fuerza hora local, evitando el corrimiento de día por UTC.
  const diaSemana = fechaRuta ? DIA_POR_GETDAY[new Date(fechaRuta + 'T00:00').getDay()] : undefined;
  const esDomingo = fechaRuta ? new Date(fechaRuta + 'T00:00').getDay() === 0 : false;

  // Agrupa los viajes por su relación con el calendario COFERSA de ese día.
  // Sin fecha (o COFERSA no cargado) → lista plana como antes.
  const agrupar = Boolean(fechaRuta) && cofersaStatus === 'ready';
  const numerosActivos = new Set(diaSemana ? rutasActivas(cofersa, diaSemana) : []);
  const numerosCita = new Set(cofersa.filter((c) => c.citaPrevia && !Number.isNaN(c.numero)).map((c) => c.numero));
  const numerosCofersa = new Set(cofersa.filter((c) => !Number.isNaN(c.numero)).map((c) => c.numero));

  const grupos = { programados: [] as Viaje[], cita: [] as Viaje[], otros: [] as Viaje[] };
  for (const v of viajes) {
    const n = numeroRuta(v);
    // Viaje cuya ruta NO está en COFERSA → siempre visible, sin marca.
    if (Number.isNaN(n) || !numerosCofersa.has(n)) grupos.otros.push(v);
    else if (numerosCita.has(n)) grupos.cita.push(v);
    else if (numerosActivos.has(n)) grupos.programados.push(v);
    else grupos.otros.push(v);
  }

  const etiquetaDia = diaSemana ? NOMBRE_DIA[diaSemana] : NOMBRE_DOMINGO;
  const nProgramados = grupos.programados.length;
  const ayuda = !fechaRuta
    ? ''
    : nProgramados > 0
      ? `${etiquetaDia} — ${nProgramados} ruta${nProgramados === 1 ? '' : 's'} COFERSA programada${nProgramados === 1 ? '' : 's'}.`
      : `${esDomingo ? NOMBRE_DOMINGO : etiquetaDia} — sin rutas COFERSA programadas ese día.`;

  const opt = (v: Viaje) => (
    <option key={v.id} value={v.id}>
      {v.trip_number}
    </option>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
      <div>
        <Select
          label="Viaje (WMS)"
          value={viajeId}
          onChange={(e) => setViajeId(e.target.value)}
          required
        >
          <option value="">Seleccionar viaje despachado</option>
          {agrupar ? (
            <>
              {grupos.programados.length > 0 && (
                <optgroup label={`Programados este ${etiquetaDia.toLowerCase()}`}>
                  {grupos.programados.map(opt)}
                </optgroup>
              )}
              {grupos.cita.length > 0 && (
                <optgroup label="Cita previa">{grupos.cita.map(opt)}</optgroup>
              )}
              {grupos.otros.length > 0 && (
                <optgroup label="Otros días / sin programación">{grupos.otros.map(opt)}</optgroup>
              )}
            </>
          ) : (
            viajes.map(opt)
          )}
        </Select>
        {ayuda && (
          <p aria-live="polite" className="mt-1 text-xs text-slate-500">
            {ayuda}
          </p>
        )}
      </div>
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
