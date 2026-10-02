// Adaptador del DEMO de la Cola de Priorización.
//
// Toma el JSON generado por el MOTOR REAL del OMS (backend/oms/demo_export.py,
// modo mock) y lo mapea a QueueOrder para renderizarlo en la tabla existente de
// la Cola de Priorización SIN tocar el motor TS del prototipo.
//
// Por ahora el demo está encendido por defecto (ver omsApi.getQueue). Honesto: las prioridades
// son salida real del motor del backend; la entrada son pedidos de ejemplo
// (no WMS en vivo). El bloque "wms" del JSON usa nombres REALES de columnas de
// EXPEDICIONESCABECERA (docs/wms-eflow/EFLOW_OLO-ddl.sql).

import demoDoc from './oms_corrida_demo.json';
import type { Country, PriorityTier, QueueOrder } from '../types';

interface DemoWms {
  IDALMACEN: string;
  IDCOMPANIA: string;
  IDSUCURSAL: string;
  IDEXPEDICION: string;
  IDCLIENTE: string;
  NOMBRECLIENTE: string;
  RUTA: string;
  TPEXPE: string;
  TPEXES: string;
  TPEXSI: string;
  FECHAEXPEDICIONPLANIFICADA: string;
  FECHACREACION: string | null;
  OBSERVACIONESEXPEDICION: string;
  PESOPEDIDO_TOTAL: number | null;
  CUBICAJEPEDIDO_TOTAL: number | null;
  COSTO_TOTAL: number | null;
  PAIS: string;
}

interface DemoOms {
  prioridad: number;
  score: number;
  cliente_retira: boolean;
  TPEXES_resultante: string;
  TPEXSI_resultante: string;
  situacion: string;
  reglas: { regla: string; puntos: number; detalle: string }[];
}

interface DemoDoc {
  pedidos: { wms: DemoWms; oms: DemoOms }[];
}

// Prioridad NUMÉRICA del motor (menor = más urgente) -> tier 1..4 del prototipo,
// SOLO para el badge de la tabla. La prioridad real es el número; el modelo de
// tiers 1..4 del prototipo es deuda a reconciliar contra la decisión "numérica".
function tierFromPrioridad(p: number): PriorityTier {
  if (p <= 1) return 1;
  if (p <= 20) return 2;
  if (p <= 50) return 3;
  return 4;
}

// FECHAEXPEDICIONPLANIFICADA / FECHACREACION son datetime (fecha + hora).
// Mostramos "YYYY-MM-DD HH:mm" (tomado directo del ISO, sin desfase de zona).
function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(iso);
  if (m) return `${m[1]} ${m[2]}`;
  return iso.slice(0, 10); // fallback: solo fecha si no trae hora
}

export function corridaDemoOrders(): QueueOrder[] {
  const doc = demoDoc as unknown as DemoDoc;
  return doc.pedidos.map(({ wms: w, oms: o }) => ({
    id: w.IDEXPEDICION,
    ref: w.IDEXPEDICION,
    warehouseId: w.IDALMACEN,
    companyId: w.IDCOMPANIA,
    branchId: w.IDSUCURSAL,
    orderType: w.TPEXPE,
    customer: w.NOMBRECLIENTE || w.IDCLIENTE,
    route: w.RUTA || '(sin ruta)',
    country: (w.PAIS === 'VE' ? 'VE' : 'CR') as Country,
    tier: tierFromPrioridad(o.prioridad),
    score: o.score,
    totalAmount: w.COSTO_TOTAL ?? 0,
    weight: w.PESOPEDIDO_TOTAL ?? 0,
    volume: w.CUBICAJEPEDIDO_TOTAL ?? 0,
    itemCount: 0,
    observations: w.OBSERVACIONESEXPEDICION ?? '',
    dispatchDate: fmtFechaHora(w.FECHAEXPEDICIONPLANIFICADA),
    createdDate: fmtFechaHora(w.FECHACREACION),
    readyToPrepDate: '',
    status: w.TPEXES, // 'DISP' — el estado NO cambia
    situation: o.TPEXSI_resultante, // 'GENE' — situación generada por el OMS
    intakeTime: '',
    appliedRules: o.reglas
      .filter((r) => r.puntos > 0)
      .map((r) => ({ name: r.regla, weight: r.puntos })),
    history: [],
  }));
}
