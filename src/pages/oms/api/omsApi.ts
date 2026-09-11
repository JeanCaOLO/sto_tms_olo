// Capa de API MOCK del OMS. Simula llamadas asíncronas sin backend real
// (sin Supabase, sin Lambdas). En Construcción real esto se reemplaza por la
// capa de datos contra el lago/Supabase. Patrón §11: Page -> Controller -> Api.

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
} from '../types';

// Simula latencia de red para que los estados de carga sean visibles.
function delay<T>(data: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

export const omsApi = {
  getRoutes(country: Country): Promise<DispatchRoute[]> {
    return delay(cofersaRoutes.filter((r) => r.country === country));
  },
  getQueue(country: Country): Promise<QueueOrder[]> {
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
};
