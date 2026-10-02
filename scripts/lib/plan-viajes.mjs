// Piezas compartidas por los scripts del disparador automático de viajes
// (preview-viaje-trigger.mjs = solo lectura, generar-viajes-automatico.mjs = escribe).
//
// El motor es el MISMO que usa la pantalla de Planificación
// (src/pages/planificacion/plan-automatico.ts → planificarDia), cargado con
// esbuild para que los scripts nunca diverjan del comportamiento del front.
// Mismo criterio de entrada que GET /api/v1/planificacion/pedidos
// (backend/planning): alistados (situacion 'GENE'), sin viaje WMH, cuya
// fecha_planificada (fecha de entrega comprometida) es la fecha objetivo.

import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COSTA_RICA_TZ = 'America/Costa_Rica';

export async function importPureModule(entryRelativePath) {
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, entryRelativePath)],
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'node18',
  });
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64');
  return import(dataUrl);
}

export async function loadEngine() {
  const { planificarDia } = await importPureModule('src/pages/planificacion/plan-automatico.ts');
  const { calcularPrioridad } = await importPureModule('src/pages/oms/engine/priorityEngine.ts');
  return { planificarDia, calcularPrioridad };
}

// Fecha ISO (día) en Costa Rica desplazada `dias` desde hoy.
export function fechaCostaRica(dias = 0) {
  const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: COSTA_RICA_TZ }));
  hoy.setDate(hoy.getDate() + dias);
  return hoy.toLocaleDateString('en-CA');
}

// --fecha YYYY-MM-DD; por defecto mañana (el flujo de Planificación arma los viajes de mañana).
export function fechaObjetivo(argv) {
  const i = argv.indexOf('--fecha');
  const fecha = i >= 0 ? argv[i + 1] : fechaCostaRica(1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '')) throw new Error('--fecha debe tener formato YYYY-MM-DD');
  return fecha;
}

const isoDay = (value) => (value ? value.toISOString().slice(0, 10) : null);

export async function loadPedidosAlistados(client, fechaEntrega, calcularPrioridad) {
  const { rows } = await client.query(
    `SELECT id, expedicion, final_customer_id, cliente_code, ruta, fecha_planificada, fecha_expedicion,
            observaciones, nombre_cliente, cant_lineas, id_compania
     FROM wms_expediciones
     WHERE situacion = 'GENE' AND numero_viaje_wmh IS NULL AND fecha_planificada = $1::date`,
    [fechaEntrega],
  );
  const hoyIso = fechaCostaRica(0);
  return rows.map((row) => {
    const prioridad = calcularPrioridad(
      { fechaPlanificada: isoDay(row.fecha_planificada), fechaExpedicion: isoDay(row.fecha_expedicion), observaciones: row.observaciones },
      hoyIso,
    );
    return {
      // Un mismo número de expedición puede repetirse en varias filas del WMS;
      // se sufija con el id de la fila para no violar orders.order_number único.
      id: row.id, order_number: `${row.expedicion}-${row.id.slice(0, 8)}`, expedicion: row.expedicion,
      customer_id: row.final_customer_id ?? row.cliente_code, cliente_code: row.cliente_code,
      store_id: '', delivery_address: '', delivery_city: '', delivery_zone: row.ruta || '(sin ruta)',
      // Peso/volumen NO existen en wms_expediciones (vienen de EFLOW): desconocidos, no 0.
      total_weight: null, total_volume: null, status: 'pending',
      order_date: isoDay(row.fecha_expedicion) ?? fechaEntrega, delivery_date: isoDay(row.fecha_planificada),
      customer_name: row.nombre_cliente, cant_lineas: row.cant_lineas ?? 0, id_compania: row.id_compania,
      prioridad: prioridad.prioridad, tier: prioridad.tier, esClienteRetira: prioridad.esClienteRetira,
    };
  });
}

// Arma la flota del día como parejas conductor-vehículo SIN repetir vehículo.
// vehicles.carrier_id viene NULL en los datos reales, así que no se puede
// emparejar por transportista: se ordena a los conductores con flota propia
// primero y se le da a cada uno un vehículo distinto; los conductores que
// sobran (más conductores que vehículos) quedan fuera.
export function armarFlota(drivers, vehicles) {
  const ordenados = [...drivers].sort((a, b) => Number(b.is_flota_propia) - Number(a.is_flota_propia));
  return ordenados.slice(0, vehicles.length).map((d, i) => {
    const v = vehicles[i];
    return {
      vehiculo: {
        id: v.id, plate: v.plate, brand: '', model: '', vehicle_type: v.vehicle_type,
        capacity_weight: Number(v.capacity_weight), capacity_volume: Number(v.capacity_volume),
        is_flota_propia: d.is_flota_propia,
      },
      conductorId: d.conductor_id,
      _carrierId: d.carrier_id,
      _conductorNombre: d.full_name,
      _carrierNombre: d.carrier_name,
    };
  });
}

// Corre el motor con una red de seguridad: ni un vehículo ni un conductor
// pueden quedar en DOS viajes el mismo día. Hoy no pasa (armarFlota no repite
// y el motor sin capacidad usa cada slot una vez), pero el motor CON capacidad
// (USAR_CAPACIDAD = true) reparte cada destino contra toda la flota. Un viaje
// que repite vehículo o conductor se descarta y sus pedidos quedan sin camión.
export function propuestasDelDia(planificarDia, pedidos, slots) {
  const { viajes, sinAsignar } = planificarDia(pedidos, slots);
  const vehiculosUsados = new Set();
  const conductoresUsados = new Set();
  const propuestas = [];
  const sinFlota = [...sinAsignar];
  for (const viaje of viajes) {
    const { vehiculo, conductorId } = viaje.slot;
    if (vehiculosUsados.has(vehiculo.id) || conductoresUsados.has(conductorId)) {
      sinFlota.push(...viaje.pedidos);
      continue;
    }
    vehiculosUsados.add(vehiculo.id);
    conductoresUsados.add(conductorId);
    propuestas.push({ ruta: viaje.destino, pedidos: viaje.pedidos, slot: viaje.slot });
  }
  return { propuestas, sinFlota };
}
