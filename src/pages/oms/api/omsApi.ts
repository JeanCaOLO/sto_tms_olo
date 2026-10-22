// Capa de API del OMS. La Cola de Priorización (getQueue) ya lee datos REALES
// de orders (= EFLOW EXPEDICIONESCABECERA, sql/43; antes wms_expediciones) y ya
// las prioriza con el Motor de Prioridad real (Fase 6, ../engine/priorityEngine.ts:
// regla T-1 + cliente retira). El resto (rutas, alertas, catálogo de reglas,
// auditoría) sigue en mock — todavía no tienen tabla real detrás.
// Patrón §11: Page -> Controller -> Api.

import { supabase } from '../../../lib/supabase';
import { calcularPrioridad } from '../engine/priorityEngine';
import {
  auditEntries,
  cofersaRoutes,
  companies,
  computeKpis,
  engineRules,
  omsAlerts,
  queueOrders,
} from '../mockData';
import type {
  AuditEntry,
  Company,
  Country,
  DispatchRoute,
  EngineRule,
  OmsAlert,
  OmsLogEntry,
  OmsLogLevel,
  PriorityTier,
  QueueOrder,
  Simulation,
  SimulationExecution,
} from '../types';

// Simula latencia de red para que los estados de carga sean visibles.
function delay<T>(data: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
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

// --- Persistencia mock del Simulador (localStorage) ---
// PROTOTIPO: sin backend. El catálogo de simulaciones guardadas y el historial
// de ejecuciones se guardan en localStorage para que la navegación se sienta
// real entre recargas.
const SIMS_KEY = 'oms.sim.simulations';
const EXEC_KEY = 'oms.sim.executions';

// Seed: una simulación de ejemplo por compañía para que la pantalla no arranque
// vacía en el prototipo. Solo se siembra si el catálogo está vacío.
function seedSimulations(): Simulation[] {
  return [
    { id: 'SIM-CF-seed', companyId: '0109', name: 'Cofersa — diaria T-1', ruleIds: ['MR-CF-1', 'MR-CF-3'], situations: ['DISP'], applyMode: 'mixto', cutoffTime: '15:00', active: true },
    { id: 'SIM-EPA-seed', companyId: 'EPA', name: 'EPA — cross docking', ruleIds: ['MR-EPA-1'], situations: ['DISP'], applyMode: 'automatico', cutoffTime: '12:00', active: true },
  ];
}

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback; // JSON corrupto o storage no disponible: degradar al default
  }
}

function writeLS(key: string, value: unknown): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage lleno / no disponible: el proto sigue en memoria de la sesión
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

const TIERS: readonly PriorityTier[] = [1, 2, 3, 4];

// Mapea un pedido de orders a QueueOrder. La llave EFLOW manda cuando el pedido
// vino de EFLOW; si no (pedidos de prueba), se usan los códigos de los maestros.
// Si el OMS ya persistió prioridad/score (orders.priority / oms_score) se muestran
// esos; si no, se calculan con el Motor de Prioridad del front.
function mapOrderToQueueOrder(row: any, country: Country, hoyIso: string): QueueOrder {
  const prioridad = calcularPrioridad(
    {
      fechaPlanificada: row.delivery_date ?? null,
      fechaExpedicion: row.order_date ?? null,
      observaciones: row.observaciones ?? null,
    },
    hoyIso,
  );
  const tierPersistido = TIERS.find((t) => t === row.priority);
  return {
    id: row.id,
    ref: row.eflow_id_expedicion ?? row.order_number,
    warehouseId: row.eflow_id_almacen ?? row.warehouse?.external_code ?? row.warehouse?.code ?? '',
    companyId: row.eflow_id_compania ?? row.customer?.external_code ?? row.customer?.code ?? '',
    branchId: row.eflow_id_sucursal ?? row.branch?.external_code ?? '',
    orderType: row.order_type ?? '',
    customer: row.final_customer?.name ?? '',
    route: row.delivery_zone || '(sin ruta)',
    country,
    tier: tierPersistido ?? prioridad.tier,
    score: row.oms_score != null ? Number(row.oms_score) : prioridad.score,
    totalAmount: Number(row.total_amount ?? 0),
    weight: Number(row.total_weight ?? 0),
    volume: Number(row.total_volume ?? 0),
    itemCount: row.total_items ?? 0,
    observations: row.observaciones ?? '',
    dispatchDate: row.delivery_date ?? '',
    createdDate: row.wms_created_at ?? row.created_at ?? '',
    status: row.wms_status ?? row.status ?? '',
    situation: row.wms_situation ?? '',
    // Estado OMS (ADR-013): priorizado = el OMS ya escribió prioridad/score;
    // liberado = ya lo mandó a eFlow (oms_processed_at sellado o situación GENE).
    prioritized: row.priority != null || row.oms_score != null || row.prioritization_run_id != null,
    released: row.oms_processed_at != null || row.wms_situation === 'GENE',
    intakeTime: row.created_at ?? '',
    appliedRules: prioridad.appliedRules,
    history: [],
  };
}

export const omsApi = {
  getRoutes(country: Country): Promise<DispatchRoute[]> {
    return delay(cofersaRoutes.filter((r) => r.country === country));
  },
  async getQueue(country: Country): Promise<QueueOrder[]> {
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
      // Solo pedidos sin cierre en el WMS (EFLOW FECHACIERRE IS NULL).
      const { data, error } = await supabase.from('orders').select(QUEUE_SELECT).is('closed_at', null);
      if (!error && data) {
        // Datos REALES de orders (aunque vengan vacíos): es lo que pidió negocio,
        // no mock. Solo un error de red/BD cae al mock de respaldo (abajo).
        const hoyIso = new Date().toISOString().slice(0, 10);
        return data
          .map((row: any) => mapOrderToQueueOrder(row, country, hoyIso))
          .sort((a, b) => b.score - a.score);
      }
      console.warn('[OMS] orders no disponible, usando mock de respaldo:', error?.message);
    }
    const rows = queueOrders
      .filter((o) => o.country === country)
      .slice()
      .sort((a, b) => b.score - a.score);
    return delay(rows);
  },
  getAlerts(country: Country): Promise<OmsAlert[]> {
    void country;
    return delay(omsAlerts);
  },
  getKpis(country: Country): Promise<ReturnType<typeof computeKpis>> {
    void country;
    return delay(computeKpis());
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
      numeroViaje: r.numero_viaje ?? null,
      eflowIdExpedicion: r.eflow_id_expedicion ?? null,
      message: r.message ?? '',
      detail: r.detail ?? null,
      actor: r.actor ?? 'system',
      countryId: r.country_id ?? null,
      companyCode: r.company_code ?? null,
    }));
  },
  // FR4 — distribución de pedidos por priority_tier (para el Panel).
  getTierDistribution(country: Country): Promise<{ tier: PriorityTier; count: number }[]> {
    void country;
    // Mock ilustrativo (conteos de ejemplo, no derivados de la cola reducida).
    return delay([
      { tier: 1, count: 12 },
      { tier: 2, count: 45 },
      { tier: 3, count: 102 },
      { tier: 4, count: 88 },
    ]);
  },

  // --- Simulador (configurador) — todo mock/localStorage ---

  // Catálogo de simulaciones guardadas de una compañía. Siembra ejemplos la
  // primera vez para que el prototipo no arranque vacío.
  getSimulations(companyId: string): Promise<Simulation[]> {
    let all = readLS<Simulation[]>(SIMS_KEY, []);
    if (all.length === 0) {
      all = seedSimulations();
      writeLS(SIMS_KEY, all);
    }
    return delay(all.filter((s) => s.companyId === companyId), 150);
  },
  // Crea o actualiza una simulación (upsert por id). No toca el flag `active`.
  saveSimulation(sim: Simulation): Promise<Simulation> {
    const all = readLS<Simulation[]>(SIMS_KEY, []);
    const i = all.findIndex((s) => s.id === sim.id);
    if (i >= 0) all[i] = sim;
    else all.push(sim);
    writeLS(SIMS_KEY, all);
    return delay(sim, 150);
  },
  // Activa UNA simulación; desactiva cualquier otra de la MISMA compañía
  // (invariante: solo una activa por compañía).
  activateSimulation(companyId: string, simId: string): Promise<Simulation[]> {
    const all = readLS<Simulation[]>(SIMS_KEY, []);
    for (const s of all) {
      if (s.companyId !== companyId) continue;
      s.active = s.id === simId;
    }
    writeLS(SIMS_KEY, all);
    return delay(all.filter((s) => s.companyId === companyId), 150);
  },

  // Historial de ejecuciones de una compañía (más recientes primero).
  getExecutions(companyId: string): Promise<SimulationExecution[]> {
    const all = readLS<SimulationExecution[]>(EXEC_KEY, []);
    const rows = all.filter((e) => e.companyId === companyId).sort((a, b) => b.executedAt.localeCompare(a.executedAt));
    return delay(rows, 150);
  },
  logExecution(exec: SimulationExecution): Promise<SimulationExecution> {
    const all = readLS<SimulationExecution[]>(EXEC_KEY, []);
    all.push(exec);
    writeLS(EXEC_KEY, all);
    return delay(exec, 150);
  },
};
