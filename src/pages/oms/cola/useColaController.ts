import { useEffect, useMemo, useState } from 'react';
import { omsApi } from '../api/omsApi';
import type { PriorityTier, QueueOrder } from '../types';

const ALL = 'todos';

export interface ColaFilters {
  warehouse: string;
  company: string;
  branch: string;
  route: string;
  tier: string;
  status: string;
  situation: string;
  query: string;
}

const EMPTY_FILTERS: ColaFilters = {
  warehouse: ALL, company: ALL, branch: ALL, route: ALL, tier: ALL, status: ALL, situation: ALL, query: '',
};

// Controller de la Cola de Priorización (FR2/FR3). Maneja filtros, selección de
// pedido y el override manual local (única intervención humana; sin backend).
export function useColaController() {
  const country = 'CR' as const;
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [filters, setFilters] = useState<ColaFilters>(EMPTY_FILTERS);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedId(null);
    omsApi.getQueue(country)
      .then((rows) => { if (!cancelled) setOrders(rows); })
      .catch(() => { if (!cancelled) setError('No se pudo cargar la cola.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Opciones de filtro derivadas de los pedidos cargados.
  const options = useMemo(() => {
    const uniq = (vals: string[]) => Array.from(new Set(vals)).sort();
    return {
      warehouses: uniq(orders.map((o) => o.warehouseId)),
      companies: uniq(orders.map((o) => o.companyId)),
      branches: uniq(orders.map((o) => o.branchId)),
      routes: uniq(orders.map((o) => o.route)),
      tiers: uniq(orders.map((o) => String(o.tier))),
      statuses: uniq(orders.map((o) => o.status)),
      situations: uniq(orders.map((o) => o.situation)),
    };
  }, [orders]);

  // Filtrado con lógica AND (FR3.3).
  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return orders.filter((o) => {
      if (filters.warehouse !== ALL && o.warehouseId !== filters.warehouse) return false;
      if (filters.company !== ALL && o.companyId !== filters.company) return false;
      if (filters.branch !== ALL && o.branchId !== filters.branch) return false;
      if (filters.route !== ALL && o.route !== filters.route) return false;
      if (filters.tier !== ALL && String(o.tier) !== filters.tier) return false;
      if (filters.status !== ALL && o.status !== filters.status) return false;
      if (filters.situation !== ALL && o.situation !== filters.situation) return false;
      if (q && !`${o.id} ${o.ref} ${o.customer} ${o.route} ${o.observations}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, filters]);

  const setFilter = (key: keyof ColaFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const resetFilters = () => setFilters(EMPTY_FILTERS);
  const filtersActive =
    filters.warehouse !== ALL || filters.company !== ALL || filters.branch !== ALL ||
    filters.route !== ALL || filters.tier !== ALL || filters.status !== ALL ||
    filters.situation !== ALL || filters.query.trim() !== '';

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  const scoreForTier: Record<PriorityTier, number> = { 1: 950, 2: 650, 3: 350, 4: 50 };

  // Override manual local (FR3.4/FR3.5): recalcula score, reordena y registra
  // en el historial del pedido. Mock: no persiste fuera de la sesión.
  const applyOverride = (tier: PriorityTier, reason: string) => {
    if (!selected) return;
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    setOrders((prev) =>
      prev
        .map((o) =>
          o.id === selected.id
            ? {
                ...o,
                tier,
                score: scoreForTier[tier],
                history: [...o.history, { at: now, from: o.tier, to: tier, type: 'manual' as const, reason }],
              }
            : o,
        )
        .sort((a, b) => b.score - a.score),
    );
    setOverrideOpen(false);
    setDetailOpen(true); // vuelve al detalle con la prioridad actualizada
  };

  return {
    // `orders` es el set FILTRADO completo (sin paginar) - DataTable hace su
    // propia paginación/orden/búsqueda internamente (ver src/components/base/DataTable.tsx);
    // pasarle un slice ya paginado desde acá rompía su selector de tamaño de página.
    orders: filtered, totalCount: orders.length, loading, error,
    filters, setFilter, resetFilters, filtersActive, options,
    selectedId, setSelectedId, selected,
    detailOpen, setDetailOpen,
    overrideOpen, setOverrideOpen, applyOverride,
  };
}
