import { useAuth } from '../../../hooks/useAuth';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Select from '../../../components/base/Select';
import Input from '../../../components/base/Input';
import ViajeAsignacionCard from './ViajeAsignacionCard';
import { resolverPedidos } from '../asignar-viajes-helpers';
import { useAsignarViajes } from '../use-asignar-viajes';
import type { Pais } from '../eflow-api';
import type { RutaTipo } from '../types';

interface Props {
  pais: Pais;
  rutas: RutaTipo[];
}

// Módulo de lectura + asignación mock: ves los pedidos de una ruta y los repartes
// en viajes que creas aquí. Una ruta puede tener varios viajes y un pedido puede
// ir en 2 viajes (Ana 2026-09-15). La fuente real (torre de control) se reemplaza.
export default function AsignarViajesTab({ pais, rutas }: Props) {
  const { appUser } = useAuth();
  const {
    rutaTypeId, fecha, pool, cargando, viajesDeRuta, seleccion,
    setFecha, elegirRuta, toggleSeleccion, crearViaje, eliminarViaje,
    asignarSeleccionAViaje, quitarPedidoDeViaje,
  } = useAsignarViajes(appUser, pais);

  const nombreRuta = (id: string) => rutas.find((r) => r.id === id)?.name || '';

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">
          <i className="ri-git-merge-line mr-2 text-teal-600"></i>Asignar Viajes
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Elige una ruta, crea los viajes que necesites y reparte los pedidos entre ellos. Un pedido puede ir en más de un viaje.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Ruta"
            value={rutaTypeId}
            onChange={(e) => elegirRuta(e.target.value, nombreRuta(e.target.value))}
            options={[{ value: '', label: 'Seleccionar ruta' }, ...rutas.map((r) => ({ value: r.id, label: r.name }))]}
          />
          <Input type="date" label="Fecha del viaje" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </Card>

      {rutaTypeId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-700">
                Pedidos de la ruta
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {cargando ? 'cargando…' : `${pool.length} · ${seleccion.size} seleccionados`}
                </span>
              </h3>
            </div>
            {pool.length === 0 && !cargando ? (
              <p className="text-sm text-slate-400 py-8 text-center">Sin pedidos pendientes para esta ruta.</p>
            ) : (
              <ul className="space-y-1.5 max-h-[60vh] overflow-auto">
                {pool.map((p) => {
                  const on = seleccion.has(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => toggleSeleccion(p.id)}
                        className={`w-full flex items-center gap-3 text-left rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                          on ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <i className={`${on ? 'ri-checkbox-fill text-teal-600' : 'ri-checkbox-blank-line text-slate-300'} text-lg`}></i>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-slate-800 truncate">
                            <span className="font-mono">{p.order_number}</span> · {p.customer_name || p.customer_id}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {(p.total_weight || 0).toFixed(1)} kg · {(p.total_volume || 0).toFixed(2)} m³
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-700">Viajes ({viajesDeRuta.length})</h3>
              <Button variant="secondary" className="text-sm" onClick={crearViaje}>
                <i className="ri-add-circle-line mr-1"></i>Nuevo viaje
              </Button>
            </div>
            {viajesDeRuta.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">
                Crea un viaje y asígnale pedidos. La ruta puede tener varios.
              </p>
            ) : (
              <div className="space-y-3">
                {viajesDeRuta.map((v) => (
                  <ViajeAsignacionCard
                    key={v.id}
                    viaje={v}
                    pedidos={resolverPedidos(pool, v.pedidoIds)}
                    seleccionCount={seleccion.size}
                    onAsignar={asignarSeleccionAViaje}
                    onQuitarPedido={quitarPedidoDeViaje}
                    onEliminar={eliminarViaje}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
