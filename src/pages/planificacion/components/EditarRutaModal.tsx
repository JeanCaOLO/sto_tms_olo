import { useEffect, useState } from 'react';
import Button from '../../../components/base/Button';
import Select from '../../../components/base/Select';
import Input from '../../../components/base/Input';
import type { RutaGenerada, CambiosRutaGenerada } from '../generar-ruta-mock';
import type { Conductor, PedidoSeleccionado, Transportista, Vehiculo } from '../types';

interface Props {
  ruta: RutaGenerada | null;
  transportistas: Transportista[];
  conductores: Conductor[];
  vehiculos: Vehiculo[];
  onClose: () => void;
  onGuardar: (id: string, cambios: CambiosRutaGenerada) => void;
}

export default function EditarRutaModal({ ruta, transportistas, conductores, vehiculos, onClose, onGuardar }: Props) {
  const [transportistaId, setTransportistaId] = useState('');
  const [conductorId, setConductorId] = useState('');
  const [vehiculoId, setVehiculoId] = useState('');
  const [fechaRuta, setFechaRuta] = useState('');
  const [pedidos, setPedidos] = useState<PedidoSeleccionado[]>([]);

  useEffect(() => {
    if (!ruta) return;
    setTransportistaId(ruta.transportistaId);
    setConductorId(ruta.conductorId);
    setVehiculoId(ruta.vehiculoId);
    setFechaRuta(ruta.fechaRuta);
    setPedidos(ruta.pedidos);
  }, [ruta]);

  if (!ruta) return null;

  const conductoresFiltrados = transportistaId ? conductores.filter((c) => c.carrier_id === transportistaId) : conductores;
  const quitarPedido = (id: string) => setPedidos((prev) => prev.filter((p) => p.id !== id));

  const guardar = () => {
    onGuardar(ruta.id, { transportistaId, conductorId, vehiculoId, fechaRuta, pedidos });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Editar {ruta.routeNumber}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center cursor-pointer">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Transportista"
              value={transportistaId}
              onChange={(e) => { setTransportistaId(e.target.value); setConductorId(''); }}
              options={[{ value: '', label: 'Todos' }, ...transportistas.map((t) => ({ value: t.id, label: t.name }))]}
            />
            <Select
              label="Conductor"
              value={conductorId}
              onChange={(e) => setConductorId(e.target.value)}
              options={[{ value: '', label: 'Seleccionar conductor' }, ...conductoresFiltrados.map((c) => ({ value: c.id, label: c.full_name }))]}
            />
            <Select
              label="Vehículo"
              value={vehiculoId}
              onChange={(e) => setVehiculoId(e.target.value)}
              options={[{ value: '', label: 'Seleccionar vehículo' }, ...vehiculos.map((v) => ({ value: v.id, label: `${v.plate} - ${v.brand} ${v.model}` }))]}
            />
            <Input type="date" label="Fecha de Ruta" value={fechaRuta} onChange={(e) => setFechaRuta(e.target.value)} />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Paradas ({pedidos.length})</p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {pedidos.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-700">{p.stop_number}. {p.order_number}</span>
                    <span className="text-slate-500"> — {p.customer_name}</span>
                  </div>
                  <button
                    onClick={() => quitarPedido(p.id)}
                    className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    title="Quitar parada"
                  >
                    <i className="ri-close-line"></i>
                  </button>
                </div>
              ))}
              {pedidos.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Sin paradas — quítala del todo con "Eliminar ruta" en su lugar.</p>}
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button type="button" onClick={guardar} disabled={pedidos.length === 0} className="flex-1">Guardar cambios</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
