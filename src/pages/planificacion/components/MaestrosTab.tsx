import { useMemo, useState } from 'react';
import Card from '../../../components/base/Card';
import Input from '../../../components/base/Input';
import StatCard from '../../../components/feature/StatCard';
import TransportistaMaestroCard from './TransportistaMaestroCard';
import type { Conductor, Transportista, Vehiculo } from '../types';

interface Props {
  transportistas: Transportista[];
  conductores: Conductor[];
  vehiculos: Vehiculo[];
}

const SIN_TRANSPORTISTA = '__sin__';

// Vista de solo lectura de los maestros de la flota: transportistas con sus
// conductores y vehículos. Sirve para revisar los datos que alimentan la
// planificación (todo leído de EFLOW WMH).
export default function MaestrosTab({ transportistas, conductores, vehiculos }: Props) {
  const [q, setQ] = useState('');

  // Agrupa conductores y vehículos por transportista (carrier_id).
  const porTransportista = useMemo(() => {
    const conCarrier = (cid: string) => Boolean(cid) && transportistas.some((t) => t.id === cid);
    const grupos = transportistas.map((t) => ({
      transportista: t,
      conductores: conductores.filter((c) => c.carrier_id === t.id),
      vehiculos: vehiculos.filter((v) => v.carrier_id === t.id),
    }));
    const sueltos = {
      transportista: { id: SIN_TRANSPORTISTA, name: 'Sin transportista' } as Transportista,
      conductores: conductores.filter((c) => !conCarrier(c.carrier_id)),
      vehiculos: vehiculos.filter((v) => !conCarrier(v.carrier_id)),
    };
    return sueltos.conductores.length || sueltos.vehiculos.length ? [...grupos, sueltos] : grupos;
  }, [transportistas, conductores, vehiculos]);

  const filtro = q.trim().toLowerCase();
  const visibles = filtro
    ? porTransportista.filter(
        (g) =>
          g.transportista.name.toLowerCase().includes(filtro) ||
          g.conductores.some((c) => c.full_name.toLowerCase().includes(filtro)) ||
          g.vehiculos.some((v) => `${v.plate} ${v.brand} ${v.model}`.toLowerCase().includes(filtro)),
      )
    : porTransportista;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon="ri-building-2-line" title="Transportistas" value={transportistas.length} color="teal" />
        <StatCard icon="ri-user-line" title="Conductores" value={conductores.length} color="blue" />
        <StatCard icon="ri-truck-line" title="Vehículos" value={vehiculos.length} color="amber" />
      </div>

      <Card>
        <Input
          placeholder="Buscar por transportista, conductor o placa…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="text-xs text-slate-400 mt-2">
          Capacidades marcadas con “~” son estimadas por marca (EFLOW devuelve 0 en casi todos los vehículos).
        </p>
      </Card>

      {visibles.length === 0 ? (
        <Card><p className="text-sm text-slate-400 text-center py-8">Sin resultados para “{q}”.</p></Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {visibles.map((g) => (
            <TransportistaMaestroCard
              key={g.transportista.id}
              transportista={g.transportista}
              conductores={g.conductores}
              vehiculos={g.vehiculos}
            />
          ))}
        </div>
      )}
    </div>
  );
}
