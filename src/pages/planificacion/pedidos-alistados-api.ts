// Puente OMS -> Planificación: pedidos que el OMS ya marcó "alistado"
// (situacion = 'GENE' en wms_expediciones, Fase 5/6 - ver
// docs/arquitectura-tms-oms/05-roadmap.md y el DECIDED de project.md sobre el
// alcance del OMS: termina en alistado, la creación del viaje es de
// Planificación/TMS).
//
// GAP CONOCIDO Y DOCUMENTADO: wms_expediciones espeja la vista "Expediciones
// (Salidas)" del WMS, que es un HEADER de expedición - no trae peso/volumen
// ni dirección de entrega a nivel de línea (esos vienen de
// EXPEDICIONESDETALLE en EFLOW_OLO, cuya réplica aún no existe - ver
// project.md DECIDED "fuente de datos"). Por eso total_weight/total_volume/
// delivery_address quedan en 0/vacío acá, igual que el patrón ya establecido
// en eflow-mappers.ts para datos QA que tampoco los trae. NO usar estos
// pedidos para capacity-fit/optimize-stops hasta que haya datos reales de
// línea - solo son aptos para decidir CUÁNDO/A QUÉ ZONA generar un viaje
// (conteo, ruta, urgencia), no CUÁNTO camión ocupan.

import { supabase } from '../../lib/supabase';
import { calcularPrioridad, type Tier } from '../oms/engine/priorityEngine';
import type { Pedido } from './types';

export interface PedidoAlistado extends Pedido {
  // Señales del OMS que Planificación necesita para decidir el momento de
  // generar el viaje - no existen en el resto del pool de Pedido.
  cant_lineas: number;
  id_compania: string;
  // Calculadas con el MISMO motor que la Cola de Priorización del OMS
  // (../oms/engine/priorityEngine.ts) - Planificación nunca reimplementa la
  // regla T-1/cliente-retira, solo la consume. En el target final esto vendría
  // ya escrito por el OMS sobre el pedido; hoy se calcula acá al leer porque
  // el OMS todavía no escribe de vuelta (ver checklist de avance).
  prioridad: number;
  tier: Tier;
  esClienteRetira: boolean;
}

export function mapExpedicionAlistadaToPedido(row: any, hoyIso: string): PedidoAlistado {
  const prioridad = calcularPrioridad(
    {
      fechaPlanificada: row.fecha_planificada ?? null,
      fechaExpedicion: row.fecha_expedicion ?? null,
      observaciones: row.observaciones ?? null,
    },
    hoyIso,
  );
  return {
    id: row.id,
    order_number: row.expedicion,
    customer_id: row.final_customer_id ?? row.cliente_code,
    store_id: '',
    delivery_address: '',
    delivery_city: '',
    delivery_zone: row.ruta || '(sin ruta)',
    total_weight: 0,
    total_volume: 0,
    status: 'pending',
    order_date: row.fecha_planificada ?? row.fecha_expedicion ?? '',
    customer_name: row.nombre_cliente,
    cant_lineas: row.cant_lineas ?? 0,
    id_compania: row.id_compania,
    prioridad: prioridad.prioridad,
    tier: prioridad.tier,
    esClienteRetira: prioridad.esClienteRetira,
  };
}

// Pedidos con situación='GENE' (alistados por el OMS, listos para que
// Planificación los agrupe en un viaje). Sin fallback mock: a diferencia de
// pedidos-api.ts (que sí simula datos de EFLOW), este puente es sobre nuestra
// propia tabla (wms_expediciones) - un error acá es un error real, no "EFLOW
// no responde", y no debería esconderse detrás de un mock.
export async function fetchPedidosAlistados(hoyIso: string = new Date().toISOString().slice(0, 10)): Promise<PedidoAlistado[]> {
  const { data, error } = await supabase
    .from('wms_expediciones')
    .select('*')
    .eq('situacion', 'GENE');
  if (error) throw new Error(`wms_expediciones no disponible: ${error.message}`);
  return (data ?? []).map((row: any) => mapExpedicionAlistadaToPedido(row, hoyIso));
}
