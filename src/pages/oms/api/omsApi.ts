// Capa de API del OMS. La Cola de Priorización (getQueue) ya lee datos REALES
// de wms_expediciones (Fase 5 — docs/arquitectura-tms-oms/05-roadmap.md) y ya
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
  PriorityTier,
  QueueOrder,
  Simulation,
  SimulationExecution,
} from '../types';

// Simula latencia de red para que los estados de carga sean visibles.
function delay<T>(data: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
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

// Mapea una fila cruda de wms_expediciones (espejo del WMS real) a QueueOrder,
// aplicando el Motor de Prioridad real en vez de un placeholder.
function mapExpedicionToQueueOrder(row: any, country: Country, hoyIso: string): QueueOrder {
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
    ref: row.expedicion,
    warehouseId: row.id_compania, // el WMS de esta captura no distingue almacén de compañía - ver nota en seed-wms-expediciones.mjs
    companyId: row.id_compania,
    branchId: row.id_sucursal,
    orderType: row.tipo_expedicion,
    customer: row.nombre_cliente,
    route: row.ruta || '(sin ruta)',
    country,
    tier: prioridad.tier,
    score: prioridad.score,
    totalAmount: 0, // no viene en la vista de Expediciones del WMS
    weight: 0,
    volume: 0,
    itemCount: row.cant_lineas ?? 0,
    observations: row.observaciones ?? '',
    dispatchDate: row.fecha_planificada ?? row.fecha_expedicion ?? '',
    createdDate: row.created_at ?? '',
    readyToPrepDate: '',
    status: row.estado,
    situation: row.situacion,
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
    if (country === 'CR') {
      const { data, error } = await supabase.from('wms_expediciones').select('*');
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[OMS] wms_expediciones no disponible, usando mock de respaldo:', error.message);
      } else if (data && data.length > 0) {
        const hoyIso = new Date().toISOString().slice(0, 10);
        return data
          .map((row: any) => mapExpedicionToQueueOrder(row, country, hoyIso))
          .sort((a, b) => b.score - a.score);
      }
      // Sin datos reales todavía (o error de red) - cae al mock en vez de
      // mostrar una cola vacía sin explicación.
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
