import { useEffect, useMemo, useState } from 'react';
import { omsApi } from '../api/omsApi';
import { useOperationalContext } from '../../../hooks/useOperationalContext';
import type { PriorityTier, QueueOrder } from '../types';

const ALL = 'todos';

// Almacén y Compañía NO van acá: los maneja el contexto operativo del header
// (País → Almacén → Cliente), que filtra los pedidos en el servidor por scope.
export interface ColaFilters {
  branch: string;
  route: string;
  tier: string;
  status: string;
  situation: string;
  estadoOms: string;
  query: string;
}

const EMPTY_FILTERS: ColaFilters = {
  branch: ALL, route: ALL, tier: ALL, status: ALL, situation: ALL, estadoOms: ALL, query: '',
};

// Estado OMS derivado del pedido (ADR-013), mismo criterio que la columna de la tabla.
export function estadoOmsDe(o: QueueOrder): string {
  return o.released ? 'Liberado' : o.prioritized ? 'Priorizado' : 'Sin priorizar';
}

// Controller de la Cola de Priorización (FR2/FR3). Maneja filtros, selección de
// pedido y el override manual local (única intervención humana; sin backend).
export function useColaController() {
  const country = 'CR' as const;
  const { selectedCountryId, selectedWarehouseId, selectedCustomerId, warehouses } = useOperationalContext();
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [filters, setFilters] = useState<ColaFilters>(EMPTY_FILTERS);

  // País seleccionado sin almacén concreto → filtrar por los almacenes de ese
  // país (orders no tiene country_id; el país va por el almacén). Si hay almacén
  // concreto, manda ese; si no hay país, no se filtra por almacén.
  const countryWarehouseIds = useMemo(
    () => (selectedCountryId && !selectedWarehouseId ? warehouses.map((w) => w.id) : []),
    [selectedCountryId, selectedWarehouseId, warehouses],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedId(null);
    omsApi.getQueue(country, {
      warehouseId: selectedWarehouseId,
      customerId: selectedCustomerId,
      warehouseIds: countryWarehouseIds,
    })
      .then((rows) => { if (!cancelled) setOrders(rows); })
      .catch(() => { if (!cancelled) setError('No se pudo cargar la cola.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedWarehouseId, selectedCustomerId, countryWarehouseIds]);

  // Opciones de filtro derivadas de los pedidos cargados.
  const options = useMemo(() => {
    const uniq = (vals: string[]) => Array.from(new Set(vals)).sort();
    return {
      branches: uniq(orders.map((o) => o.branchId)),
      routes: uniq(orders.map((o) => o.route)),
      tiers: uniq(orders.map((o) => String(o.tier))),
      statuses: uniq(orders.map((o) => o.status)),
      situations: uniq(orders.map((o) => o.situation)),
      estadosOms: uniq(orders.map(estadoOmsDe)),
    };
  }, [orders]);

  // Al cambiar el conjunto cargado (p. ej. se cambió el cliente del header),
  // un filtro cuyo valor ya no existe entre las opciones dejaría la tabla vacía
  // "pegada" (ej.: Estado OMS=Priorizado al pasar a una compañía sin pendientes).
  // Se resetea a "Todos" automáticamente para no tener que limpiarlo a mano.
  useEffect(() => {
    const available: Record<string, string[]> = {
      branch: options.branches, route: options.routes, tier: options.tiers,
      status: options.statuses, situation: options.situations, estadoOms: options.estadosOms,
    };
    setFilters((prev) => {
      let changed = false;
      const next = { ...prev };
      (Object.keys(available) as (keyof ColaFilters)[]).forEach((k) => {
        if (next[k] !== ALL && !available[k].includes(next[k])) { next[k] = ALL; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [options]);

  // Filtrado con lógica AND (FR3.3).
  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return orders.filter((o) => {
      if (filters.branch !== ALL && o.branchId !== filters.branch) return false;
      if (filters.route !== ALL && o.route !== filters.route) return false;
      if (filters.tier !== ALL && String(o.tier) !== filters.tier) return false;
      if (filters.status !== ALL && o.status !== filters.status) return false;
      if (filters.situation !== ALL && o.situation !== filters.situation) return false;
      if (filters.estadoOms !== ALL && estadoOmsDe(o) !== filters.estadoOms) return false;
      if (q && !`${o.id} ${o.ref} ${o.customer} ${o.route} ${o.observations}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, filters]);

  const setFilter = (key: keyof ColaFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const resetFilters = () => setFilters(EMPTY_FILTERS);
  const filtersActive =
    filters.branch !== ALL || filters.route !== ALL || filters.tier !== ALL ||
    filters.status !== ALL || filters.situation !== ALL || filters.estadoOms !== ALL ||
    filters.query.trim() !== '';

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
