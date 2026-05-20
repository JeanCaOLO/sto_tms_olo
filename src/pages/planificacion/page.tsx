import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import PedidosRuta from './components/PedidosRuta';
import RutaEnConstruccion from './components/RutaEnConstruccion';
import ConfiguracionRuta from './components/ConfiguracionRuta';

interface Pedido {
  id: string;
  order_number: string;
  customer_id: string;
  store_id: string;
  delivery_address: string;
  delivery_city: string;
  delivery_zone: string;
  total_weight: number;
  total_volume: number;
  status: string;
  order_date: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  customer_name?: string;
  store_name?: string;
  route_type_id?: string;
}

interface PedidoSeleccionado extends Pedido {
  stop_number: number;
}

interface Vehiculo {
  id: string;
  plate: string;
  type: string;
  capacity_kg: number;
  capacity_m3: number;
}

interface Conductor {
  id: string;
  full_name: string;
  document: string;
  carrier_id: string;
}

interface Transportista {
  id: string;
  name: string;
}

interface RutaTipo {
  id: string;
  name: string;
}

// Algoritmo de vecino más cercano para optimizar paradas
function optimizarParadas(pedidos: Pedido[]): Pedido[] {
  if (pedidos.length <= 1) return pedidos;

  const conCoords = pedidos.filter(
    (p) => p.delivery_latitude != null && p.delivery_longitude != null
  );

  // Si no hay coordenadas, ordenar por zona/ciudad
  if (conCoords.length < 2) {
    return [...pedidos].sort((a, b) => {
      const zonaA = (a.delivery_zone || '') + (a.delivery_city || '');
      const zonaB = (b.delivery_zone || '') + (b.delivery_city || '');
      return zonaA.localeCompare(zonaB);
    });
  }

  // Nearest-neighbor greedy
  const distancia = (a: Pedido, b: Pedido): number => {
    const lat1 = a.delivery_latitude!;
    const lng1 = a.delivery_longitude!;
    const lat2 = b.delivery_latitude!;
    const lng2 = b.delivery_longitude!;
    return Math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2);
  };

  const visitados = new Set<string>();
  const resultado: Pedido[] = [];
  let actual = pedidos[0];
  visitados.add(actual.id);
  resultado.push(actual);

  while (resultado.length < pedidos.length) {
    let minDist = Infinity;
    let siguiente: Pedido | null = null;
    for (const p of pedidos) {
      if (visitados.has(p.id)) continue;
      const d = distancia(actual, p);
      if (d < minDist) {
        minDist = d;
        siguiente = p;
      }
    }
    if (!siguiente) break;
    visitados.add(siguiente.id);
    resultado.push(siguiente);
    actual = siguiente;
  }

  return resultado;
}

export default function PlanificacionPage() {
  const { appUser } = useAuth();

  // Catálogos
  const [rutas, setRutas] = useState<RutaTipo[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);

  // Pedidos de la ruta seleccionada
  const [pedidosRuta, setPedidosRuta] = useState<Pedido[]>([]);
  const [cargandoPedidos, setCargandoPedidos] = useState(false);

  // Ruta en construcción
  const [pedidosSeleccionados, setPedidosSeleccionados] = useState<PedidoSeleccionado[]>([]);

  // Configuración
  const [rutaTypeId, setRutaTypeIdState] = useState('');
  const [transportistaId, setTransportistaId] = useState('');
  const [conductorId, setConductorId] = useState('');
  const [vehiculoId, setVehiculoId] = useState('');
  const [fechaRuta, setFechaRuta] = useState(new Date().toISOString().split('T')[0]);
  const [generando, setGenerando] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (appUser) cargarCatalogos();
  }, [appUser]);

  const cargarCatalogos = async () => {
    try {
      setLoading(true);
      const [rutasRes, vehiculosRes, transportistasRes, conductoresRes] = await Promise.all([
        supabase.from('route_types').select('id, name').eq('status', 'active').order('name'),
        supabase.from('vehicles').select('*').eq('status', 'active').eq('organization_id', appUser!.organization_id).order('plate'),
        supabase.from('carriers').select('id, name').eq('status', 'active').eq('organization_id', appUser!.organization_id).order('name'),
        supabase.from('drivers').select('id, full_name, document, carrier_id').eq('status', 'active').eq('organization_id', appUser!.organization_id).order('full_name'),
      ]);
      setRutas(rutasRes.data || []);
      setVehiculos(vehiculosRes.data || []);
      setTransportistas(transportistasRes.data || []);
      setConductores(conductoresRes.data || []);
    } catch (error) {
      console.error('Error cargando catálogos:', error);
    } finally {
      setLoading(false);
    }
  };

  const cargarPedidosDeRuta = useCallback(async (rtId: string) => {
    if (!rtId || !appUser) {
      setPedidosRuta([]);
      setPedidosSeleccionados([]);
      return;
    }
    try {
      setCargandoPedidos(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(name), stores(name)')
        .eq('route_type_id', rtId)
        .eq('status', 'pending')
        .eq('organization_id', appUser.organization_id)
        .order('order_date', { ascending: true });

      if (error) throw error;

      const formateados: Pedido[] = (data || []).map((p: any) => ({
        ...p,
        customer_name: p.customers?.name,
        store_name: p.stores?.name,
      }));

      setPedidosRuta(formateados);

      // Auto-cargar todos los pedidos a la ruta
      const conNumeroParada = formateados.map((p, i) => ({ ...p, stop_number: i + 1 }));
      setPedidosSeleccionados(conNumeroParada);
    } catch (error) {
      console.error('Error cargando pedidos de la ruta:', error);
    } finally {
      setCargandoPedidos(false);
    }
  }, [appUser]);

  const setRutaTypeId = (value: string) => {
    setRutaTypeIdState(value);
    cargarPedidosDeRuta(value);
  };

  const handleSetTransportistaId = (value: string) => {
    setTransportistaId(value);
    setConductorId('');
  };

  const togglePedido = (pedido: Pedido) => {
    const estaIncluido = pedidosSeleccionados.some((p) => p.id === pedido.id);
    if (estaIncluido) {
      const nuevos = pedidosSeleccionados
        .filter((p) => p.id !== pedido.id)
        .map((p, i) => ({ ...p, stop_number: i + 1 }));
      setPedidosSeleccionados(nuevos);
    } else {
      const stopNumber = pedidosSeleccionados.length + 1;
      setPedidosSeleccionados([...pedidosSeleccionados, { ...pedido, stop_number: stopNumber }]);
    }
  };

  const quitarPedido = (pedidoId: string) => {
    const nuevos = pedidosSeleccionados
      .filter((p) => p.id !== pedidoId)
      .map((p, i) => ({ ...p, stop_number: i + 1 }));
    setPedidosSeleccionados(nuevos);
  };

  const reordenarParadas = (fromIndex: number, toIndex: number) => {
    const nuevos = [...pedidosSeleccionados];
    const [removed] = nuevos.splice(fromIndex, 1);
    nuevos.splice(toIndex, 0, removed);
    setPedidosSeleccionados(nuevos.map((p, i) => ({ ...p, stop_number: i + 1 })));
  };

  const optimizarRuta = () => {
    if (pedidosSeleccionados.length < 2) return;
    const optimizados = optimizarParadas(pedidosSeleccionados);
    setPedidosSeleccionados(optimizados.map((p, i) => ({ ...p, stop_number: i + 1 })));
  };

  const generarRuta = async () => {
    if (!conductorId || !vehiculoId || !rutaTypeId || pedidosSeleccionados.length === 0) {
      alert('Por favor completa todos los campos y asegúrate de tener pedidos en la ruta');
      return;
    }
    try {
      setGenerando(true);

      const vehiculo = vehiculos.find((v) => v.id === vehiculoId);
      if (!vehiculo) throw new Error('Vehículo no encontrado');

      const totalWeight = pedidosSeleccionados.reduce((s, p) => s + (p.total_weight || 0), 0);
      const totalVolume = pedidosSeleccionados.reduce((s, p) => s + (p.total_volume || 0), 0);
      const storeId = pedidosSeleccionados[0].store_id;

      const { data: conductorData } = await supabase
        .from('drivers')
        .select('carrier_id')
        .eq('id', conductorId)
        .maybeSingle();

      const { data: rutaData, error: rutaError } = await supabase
        .from('routes')
        .insert({
          route_number: `RT-${Date.now()}`,
          route_date: fechaRuta,
          store_id: storeId,
          driver_id: conductorId,
          vehicle_id: vehiculoId,
          carrier_id: conductorData?.carrier_id,
          route_type_id: rutaTypeId,
          status: 'Planificada',
          total_stops: pedidosSeleccionados.length,
          completed_stops: 0,
          total_weight: totalWeight,
          total_volume: totalVolume,
          capacity_percentage: Math.round((totalWeight / vehiculo.capacity_kg) * 100),
          organization_id: appUser!.organization_id,
        })
        .select()
        .single();

      if (rutaError) throw rutaError;

      // Crear guías de despacho en la secuencia optimizada
      await Promise.all(
        pedidosSeleccionados.map((pedido) =>
          supabase.from('dispatch_guides').insert({
            guide_number: `GD-${Date.now()}-${pedido.stop_number}`,
            route_id: rutaData.id,
            order_id: pedido.id,
            sequence_number: pedido.stop_number,
            status: 'Pendiente',
            organization_id: appUser!.organization_id,
          })
        )
      );

      // Actualizar estado de los pedidos
      await Promise.all(
        pedidosSeleccionados.map((pedido) =>
          supabase.from('orders').update({ status: 'Asignado' }).eq('id', pedido.id)
        )
      );

      const rutaNombre = rutas.find((r) => r.id === rutaTypeId)?.name || '';
      alert(`¡Ruta ${rutaData.route_number} (${rutaNombre}) generada exitosamente con ${pedidosSeleccionados.length} paradas!`);

      // Resetear
      setPedidosSeleccionados([]);
      setPedidosRuta([]);
      setRutaTypeIdState('');
      setTransportistaId('');
      setConductorId('');
      setVehiculoId('');
      setFechaRuta(new Date().toISOString().split('T')[0]);
    } catch (error) {
      console.error('Error al generar ruta:', error);
      alert('Error al generar la ruta. Por favor intenta nuevamente.');
    } finally {
      setGenerando(false);
    }
  };

  const vehiculoSeleccionado = vehiculos.find((v) => v.id === vehiculoId);
  const totalWeight = pedidosSeleccionados.reduce((s, p) => s + (p.total_weight || 0), 0);
  const totalVolume = pedidosSeleccionados.reduce((s, p) => s + (p.total_volume || 0), 0);
  const rutaNombre = rutas.find((r) => r.id === rutaTypeId)?.name || '';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Planificación de Rutas</h1>
          <p className="text-sm text-slate-500 mt-1">
            Selecciona una ruta del catálogo, asigna transportista, conductor y vehículo, y genera la ruta óptima de entrega
          </p>
        </div>
        {pedidosSeleccionados.length > 0 && (
          <div className="flex items-center gap-2 text-sm bg-teal-50 border border-teal-200 text-teal-700 px-3 py-2 rounded-lg">
            <i className="ri-checkbox-circle-line"></i>
            <span><strong>{pedidosSeleccionados.length}</strong> de <strong>{pedidosRuta.length}</strong> pedidos incluidos</span>
          </div>
        )}
      </div>

      <ConfiguracionRuta
        rutas={rutas}
        transportistas={transportistas}
        conductores={conductores}
        vehiculos={vehiculos}
        rutaTypeId={rutaTypeId}
        transportistaId={transportistaId}
        conductorId={conductorId}
        vehiculoId={vehiculoId}
        fechaRuta={fechaRuta}
        setRutaTypeId={setRutaTypeId}
        setTransportistaId={handleSetTransportistaId}
        setConductorId={setConductorId}
        setVehiculoId={setVehiculoId}
        setFechaRuta={setFechaRuta}
        vehiculoSeleccionado={vehiculoSeleccionado}
        totalWeight={totalWeight}
        totalVolume={totalVolume}
        pedidosCount={pedidosSeleccionados.length}
        onGenerarRuta={generarRuta}
        onOptimizarRuta={optimizarRuta}
        generando={generando}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PedidosRuta
          rutaNombre={rutaNombre}
          pedidos={pedidosRuta}
          pedidosIncluidos={pedidosSeleccionados.map((p) => p.id)}
          onTogglePedido={togglePedido}
          rutaSeleccionada={!!rutaTypeId}
          cargandoPedidos={cargandoPedidos}
        />

        <RutaEnConstruccion
          pedidosSeleccionados={pedidosSeleccionados}
          onQuitarPedido={quitarPedido}
          onReordenarParadas={reordenarParadas}
        />
      </div>
    </div>
  );
}
