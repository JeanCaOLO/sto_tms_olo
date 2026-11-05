// Capa de API del OMS. La Cola de Priorización (getQueue) ya lee datos REALES
// de orders (= EFLOW EXPEDICIONESCABECERA, sql/43; antes wms_expediciones) y ya
// las prioriza con el Motor de Prioridad real (Fase 6, ../engine/priorityEngine.ts:
// regla T-1 + cliente retira). El resto (rutas, alertas, catálogo de reglas,
// auditoría) sigue en mock — todavía no tienen tabla real detrás. El catálogo de
// reglas es de SOLO LECTURA (DECIDED 2026-11-05): las reglas son fijas en código.
// Patrón §11: Page -> Controller -> Api.

import { supabase } from '../../../lib/supabase';
import {
  auditEntries,
  cofersaRoutes,
  companies,
  engineRules,
  queueOrders,
} from '../mockData';
import type {
  AuditEntry,
  Company,
  Country,
  DispatchRoute,
  EngineRule,
  OmsCorrida,
  OmsLogEntry,
  OmsLogLevel,
  OmsMotorActividad,
  OmsPipeline,
  ProximaLiberacion,
  QueueOrder,
} from '../types';

// Simula latencia de red para que los estados de carga sean visibles.
function delay<T>(data: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

// Scope del contexto operativo del header (País → Almacén → Cliente). La Cola
// filtra orders por estos ids (orders.warehouse_id / orders.customer_id son FK
// directas a los mismos UUIDs del contexto). `warehouseIds` = almacenes del país
// seleccionado, para filtrar por país cuando aún no se eligió un almacén (orders
// no tiene country_id; el país va por el almacén).
export interface QueueScope {
  warehouseId?: string | null;
  customerId?: string | null;
  warehouseIds?: string[];
}

// Modo DEMO: alimenta la Cola con el JSON generado por el MOTOR REAL del backend
// (src/pages/oms/demo/) en vez de Supabase/mock + motor TS. Sirve para mostrar en
// la tabla cómo prioriza el motor nuevo del OMS.
//
// APAGADO POR DEFECTO: la Cola lee los pedidos REALES de orders (Aurora, vía
// /api/data). El demo del motor queda disponible solo bajo demanda:
//   - `?demo=1` en la URL lo ENCIENDE y lo recuerda en la sesión (localStorage).
//   - `?demo=0` lo APAGA.
const DEMO_LS_KEY = 'oms.demo';
const DEMO_POR_DEFECTO = false;

function readDemoParam(): string | null {
  if (typeof window === 'undefined') return null;
  const fromSearch = new URLSearchParams(window.location.search).get('demo');
  if (fromSearch !== null) return fromSearch;
  // Soporte por si en el futuro se usa hash routing (#/oms/cola?demo=1).
  const hash = window.location.hash;
  const qi = hash.indexOf('?');
  return qi >= 0 ? new URLSearchParams(hash.slice(qi)).get('demo') : null;
}

function isOmsDemo(): boolean {
  try {
    const param = readDemoParam();
    if (param === '1') {
      try { localStorage.removeItem(DEMO_LS_KEY); } catch { /* storage no disponible */ }
      return true;
    }
    if (param === '0') {
      // Apagado explícito: lo recordamos para que siga apagado al navegar.
      try { localStorage.setItem(DEMO_LS_KEY, '0'); } catch { /* storage no disponible */ }
      return false;
    }
    try {
      if (localStorage.getItem(DEMO_LS_KEY) === '0') return false;
    } catch { /* storage no disponible */ }
    return DEMO_POR_DEFECTO;
  } catch {
    return DEMO_POR_DEFECTO;
  }
}

// Pedidos de la Cola: public.orders (= EFLOW EXPEDICIONESCABECERA, sql/43), con sus
// maestros. Reemplaza a wms_expediciones (paso 5 del plan de pedidos EFLOW).
const QUEUE_SELECT = `
  *,
  customer:customers(code, external_code),
  warehouse:warehouses(code, external_code),
  branch:branches(external_code, name),
  final_customer:final_customers(external_code, name)
`;

// --- Panel del motor: columnas y helpers del embudo ---
// Columnas mínimas de orders para derivar el embudo sin traer toda la fila.
const PANEL_SELECT =
  'priority,oms_score,prioritization_run_id,planning_run_id,oms_processed_at,wms_situation,dispatch_date,lead_time_days,numero_viaje,delivery_date,delivery_date_change_count,closed_at';
// Política del OMS (ADR-013): la ventana de liberación abre dispatch_date − N días.
const DIAS_PREP_PICKING_DEFECTO = 1;
// Acciones de negocio que forman el "Historial OMS" del panel (barrido automático
// + acciones manuales). Los logs internos/por pedido quedan fuera del historial.
const HISTORIAL_ACTIONS = new Set(['barrido', 'procesar_viaje', 'override_manual']);

// Día ISO (YYYY-MM-DD) de un timestamp/fecha; null si viene vacío.
function isoDay(value: unknown): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

// Resta `dias` a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD.
function restarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

// Normaliza el jsonb `detail` a objeto (el backend puede devolverlo como objeto o string).
function parseDetail(d: unknown): Record<string, unknown> {
  if (d && typeof d === 'object') return d as Record<string, unknown>;
  if (typeof d === 'string') {
    try { return JSON.parse(d) as Record<string, unknown>; } catch { return {}; }
  }
  return {};
}

// Mapea un pedido de orders a QueueOrder. La llave EFLOW manda cuando el pedido
// vino de EFLOW; si no (pedidos de prueba), se usan los códigos de los maestros.
//
// Qué prioridad se muestra depende de si la compañía la PRIORIZA el OMS o es
// PASS-THROUGH (config `oms_rule_configs.priorizar`):
//  - Pass-through (priorizar=false, p. ej. EPA): conserva su prioridad de EFLOW
//    (orders.priority). Es su prioridad REAL y no cambia (el OMS NO la recalcula ni
//    la pone en 0 al liberar). Siempre se muestra tal cual.
//  - Priorizada por el OMS (Cofersa, escala 0..n): la prioridad SOLO es válida
//    cuando el OMS ya priorizó (prioritization_run_id). Si no, prioridad = null y la
//    UI muestra "Sin priorizar" — NO se muestra el valor heredado de EFLOW, que no
//    pertenece a la escala del OMS.
// `score` es del OMS: solo existe cuando el OMS priorizó (EPA no tiene score).
function mapOrderToQueueOrder(row: any, country: Country, passThrough: Set<string>): QueueOrder {
  const priorizadoOms = row.prioritization_run_id != null;
  const esPassThrough = passThrough.has(row.customer_id);
  const priority = esPassThrough
    ? (row.priority != null ? Number(row.priority) : null)
    : (priorizadoOms && row.priority != null ? Number(row.priority) : null);
  return {
    id: row.id,
    ref: row.eflow_id_expedicion ?? row.order_number,
    warehouseId: row.eflow_id_almacen ?? row.warehouse?.external_code ?? row.warehouse?.code ?? '',
    companyId: row.eflow_id_compania ?? row.customer?.external_code ?? row.customer?.code ?? '',
    branchId: row.eflow_id_sucursal ?? row.branch?.external_code ?? '',
    orderType: row.order_type ?? '',
    customer: row.final_customer?.name ?? '',
    route: row.delivery_zone || '(sin zona)',
    country,
    priority,
    score: priorizadoOms && row.oms_score != null ? Number(row.oms_score) : 0,
    totalAmount: Number(row.total_amount ?? 0),
    weight: Number(row.total_weight ?? 0),
    volume: Number(row.total_volume ?? 0),
    itemCount: row.total_items ?? 0,
    observations: row.observaciones ?? '',
    dispatchDate: row.delivery_date ?? '',
    salidaDate: row.dispatch_date ?? '',
    createdDate: row.wms_created_at ?? row.created_at ?? '',
    status: row.wms_status ?? row.status ?? '',
    situation: row.wms_situation ?? '',
    // `prioritized` = el OMS calculó score para el pedido (gobierna la columna Score).
    // Las compañías pass-through (EPA) son false: tienen prioridad pero no score del OMS.
    // La pertenencia a la cola y el badge de prioridad se rigen por `priority != null`.
    prioritized: priorizadoOms,
    released: row.oms_processed_at != null || row.wms_situation === 'GENE',
    intakeTime: row.created_at ?? '',
    appliedRules: [],
    history: [],
  };
}

// Compañías PASS-THROUGH (customer_id con priorizar=false en oms_rule_configs):
// conservan su prioridad de EFLOW; el OMS no la recalcula (p. ej. EPA). Se consulta
// la config real (no se hardcodea la compañía) y se cachea por sesión. Si la lectura
// falla, se degrada a "ninguna pass-through" (no cachea el fallo → reintenta luego).
let _passThroughCache: Set<string> | null = null;
async function passThroughCustomers(): Promise<Set<string>> {
  if (_passThroughCache) return _passThroughCache;
  const { data, error } = await supabase
    .from('oms_rule_configs')
    .select('customer_id')
    .eq('scope_type', 'customer')
    .eq('priorizar', false);
  if (error || !data) {
    console.warn('[OMS] oms_rule_configs (pass-through) no disponible:', error?.message);
    return new Set<string>();
  }
  const set = new Set<string>();
  for (const r of data as any[]) if (r.customer_id) set.add(r.customer_id);
  _passThroughCache = set;
  return set;
}

export const omsApi = {
  getRoutes(country: Country): Promise<DispatchRoute[]> {
    return delay(cofersaRoutes.filter((r) => r.country === country));
  },
  async getQueue(country: Country, scope: QueueScope = {}): Promise<QueueOrder[]> {
    // Modo DEMO: pedidos priorizados por el motor real del backend (JSON export).
    if (isOmsDemo()) {
      const { corridaDemoOrders } = await import('../demo/corridaDemo');
      const rows = corridaDemoOrders()
        .filter((o) => o.country === country)
        .slice()
        .sort((a, b) => b.score - a.score);
      return delay(rows);
    }
    if (country === 'CR') {
      // Solo pedidos sin cierre en el WMS (EFLOW FECHACIERRE IS NULL), filtrados
      // por el contexto operativo del header (almacén / compañía / país).
      let query = supabase.from('orders').select(QUEUE_SELECT).is('closed_at', null);
      if (scope.warehouseId) query = query.eq('warehouse_id', scope.warehouseId);
      else if (scope.warehouseIds && scope.warehouseIds.length > 0) query = query.in('warehouse_id', scope.warehouseIds);
      if (scope.customerId) query = query.eq('customer_id', scope.customerId);
      const { data, error } = await query;
      if (!error && data) {
        // Datos REALES de orders (aunque vengan vacíos): es lo que pidió negocio.
        const passThrough = await passThroughCustomers();
        return data
          .map((row: any) => mapOrderToQueueOrder(row, country, passThrough))
          .sort((a, b) => b.score - a.score);
      }
      // CR trabaja SOLO con datos reales: ante un error de BD mostramos la cola
      // vacía (y el error en consola), NUNCA mock. El mock de abajo queda solo
      // para países sin fuente real todavía (p. ej. VE).
      console.error('[OMS] cola no disponible (orders):', error?.message);
      return [];
    }
    const rows = queueOrders
      .filter((o) => o.country === country)
      .slice()
      .sort((a, b) => b.score - a.score);
    return delay(rows);
  },
  getEngineRules(): Promise<EngineRule[]> {
    return delay(engineRules);
  },
  getCompanies(): Promise<Company[]> {
    return delay(companies);
  },
  getAudit(country: Country): Promise<AuditEntry[]> {
    return delay(auditEntries.filter((a) => a.country === country));
  },
  // Bitácora del OMS (sql/49 oms_logs), más recientes primero. Lee datos REALES
  // de Aurora vía /api/data; si la tabla no existe/aún no hay backend que escriba,
  // devuelve lista vacía (no mock) para no inventar logs.
  async getOmsLogs(limit = 200): Promise<OmsLogEntry[]> {
    const { data, error } = await supabase
      .from('oms_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) {
      console.warn('[OMS] oms_logs no disponible:', error?.message);
      return [];
    }
    return (data as any[]).map((r) => ({
      id: r.id,
      createdAt: r.created_at ?? '',
      level: (r.level ?? 'info') as OmsLogLevel,
      action: r.action ?? '',
      corridaId: r.corrida_id ?? null,
      message: r.message ?? '',
      detail: r.detail ?? null,
      actor: r.actor ?? 'system',
    }));
  },
  // Limpia la bitácora del OMS (oms_logs) en un RANGO de fechas. Solo la dispara
  // el rol developer desde la consola de Auditoría. `fromIso`/`toIso` son límites
  // ISO; el backend exige al menos un filtro en el DELETE, así que siempre se pasa
  // alguno (si faltara el rango, se usa created_at >= época = todo). Devuelve
  // cuántas filas borró.
  async clearOmsLogs(range?: { fromIso?: string; toIso?: string }): Promise<number> {
    let q = supabase.from('oms_logs').delete();
    if (range?.fromIso) q = q.gte('created_at', range.fromIso);
    if (range?.toIso) q = q.lt('created_at', range.toIso);
    if (!range?.fromIso && !range?.toIso) q = q.gte('created_at', '1900-01-01');
    const { data, error } = await q.select('id');
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data.length : 0;
  },
  // --- Panel del motor del OMS (dashboard real sobre orders + oms_logs) ---

  // Embudo del día + "por liberar pronto". Lee las columnas mínimas de los pedidos
  // ABIERTOS (closed_at IS NULL) y agrupa en el cliente: el cliente propio no tiene
  // operador "IS NOT NULL", y con el volumen actual (~cientos) traer y contar aquí
  // es barato y evita filtros que el backend genérico no expone. El scope operativo
  // (almacén/compañía del header) ya lo aplica el backend por headers.
  async getPanelResumen(): Promise<{ pipeline: OmsPipeline; proximas: ProximaLiberacion[] }> {
    const { data, error } = await supabase.from('orders').select(PANEL_SELECT).is('closed_at', null);
    if (error || !data) throw new Error(error?.message ?? 'No se pudo leer orders');
    const rows = data as any[];
    const hoyIso = new Date().toISOString().slice(0, 10);

    const conPlan = (r: any) => r.planning_run_id != null;
    const sinLiberar = (r: any) => r.oms_processed_at == null;
    const priorizado = (r: any) => r.prioritization_run_id != null;

    const pipeline: OmsPipeline = {
      abiertos: rows.length,
      enCola: rows.filter((r) => conPlan(r) && sinLiberar(r) && !priorizado(r)).length,
      priorizados: rows.filter((r) => conPlan(r) && sinLiberar(r) && priorizado(r)).length,
      liberadosHoy: rows.filter((r) => r.oms_processed_at != null && isoDay(r.oms_processed_at) === hoyIso).length,
      // Indicadores de atención (reunión 2026-11-03):
      //  - sin fecha de entrega: cualquier pedido abierto sin delivery_date (anomalía);
      //  - sin fecha de salida: SOLO los ya planificados (planning_run_id) sin dispatch_date
      //    (los de bandeja sin planificar legítimamente no la tienen → no son anomalía);
      //  - modificaciones de fecha: suma del contador por pedido (0 hasta que exista la
      //    edición de fecha con aprobación; ver sql/56).
      sinFechaEntrega: rows.filter((r) => r.delivery_date == null).length,
      sinFechaSalida: rows.filter((r) => conPlan(r) && r.dispatch_date == null).length,
      modificacionesFecha: rows.reduce((acc, r) => acc + (Number(r.delivery_date_change_count) || 0), 0),
    };

    // "Por liberar pronto": priorizados-no-liberados por fecha de salida del viaje.
    // La ventana de liberación abre dispatch_date − dias_prep_picking (default 1).
    const porFecha = new Map<string, { pedidos: number; viajes: Set<string> }>();
    for (const r of rows) {
      if (!(conPlan(r) && sinLiberar(r) && priorizado(r))) continue;
      const salida = isoDay(r.dispatch_date);
      if (!salida) continue;
      const g = porFecha.get(salida) ?? { pedidos: 0, viajes: new Set<string>() };
      g.pedidos += 1;
      if (r.numero_viaje) g.viajes.add(String(r.numero_viaje));
      porFecha.set(salida, g);
    }
    const proximas: ProximaLiberacion[] = [...porFecha.entries()]
      .map(([dispatchDate, g]) => {
        const ventanaAbre = restarDias(dispatchDate, DIAS_PREP_PICKING_DEFECTO);
        return { dispatchDate, ventanaAbre, abreHoy: ventanaAbre <= hoyIso, pedidos: g.pedidos, viajes: g.viajes.size };
      })
      .sort((a, b) => a.dispatchDate.localeCompare(b.dispatchDate))
      .slice(0, 8);

    return { pipeline, proximas };
  },

  // Latido del motor: últimas corridas (filas 'barrido' de oms_logs con sus totales
  // de detail) + conteo de errores de las últimas 24 h. Si no hay backend/tabla,
  // devuelve vacío (no inventa corridas).
  async getMotorActividad(limit = 10): Promise<OmsMotorActividad> {
    const { data, error } = await supabase
      .from('oms_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(120);
    if (error || !data) {
      console.warn('[OMS] oms_logs no disponible para el panel:', error?.message);
      return { ultima: null, corridas: [], erroresRecientes: 0 };
    }
    const logs = data as any[];
    const toCorrida = (r: any): OmsCorrida => {
      const d = parseDetail(r.detail);
      const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : null);
      return {
        id: r.id,
        createdAt: r.created_at ?? '',
        corridaId: r.corrida_id ?? null,
        actor: r.actor ?? 'system',
        level: (r.level ?? 'info') as OmsLogLevel,
        action: r.action ?? '',
        total: num('total'),
        priorizados: num('priorizados'),
        liberados: num('liberados'),
        pendientes: num('pendientes'),
        reconciliados: num('reconciliados'),
        message: r.message ?? '',
      };
    };
    // Historial OMS: acciones de negocio (corrida automática + acciones manuales).
    const corridas = logs.filter((r) => HISTORIAL_ACTIONS.has(r.action)).slice(0, limit).map(toCorrida);
    // La snapshot superior refleja la última corrida AUTOMÁTICA (barrido).
    const ultima = corridas.find((c) => c.action === 'barrido') ?? null;
    const hace24h = Date.now() - 24 * 60 * 60 * 1000;
    const erroresRecientes = logs.filter(
      (r) => r.level === 'error' && r.created_at && new Date(r.created_at).getTime() >= hace24h,
    ).length;
    return { ultima, corridas, erroresRecientes };
  },
};
