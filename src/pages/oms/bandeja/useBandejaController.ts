import { useEffect, useMemo, useState } from 'react';
import { fetchBandeja } from './bandeja-api';
import { useOperationalContext } from '../../../hooks/useOperationalContext';
import type { QueueOrder } from '../types';

const ALL = 'todos';

// Bandeja = pedidos crudos (sin priorizar/liberar). Copia de la Cola SIN los filtros
// de Prioridad/Estado/Situación: en la bandeja todo está en DISP. Almacén y Compañía
// los filtra el contexto operativo del header (País → Almacén → Cliente) en servidor.
export interface BandejaFilters { branch: string; route: string; query: string }

const EMPTY_FILTERS: BandejaFilters = { branch: ALL, route: ALL, query: '' };

export function useBandejaController() {
  // El scope (almacén/compañía) lo adjunta apiFetch como headers; estos valores solo
  // disparan la recarga al cambiar de contexto.
  const { selectedWarehouseId, selectedCustomerId } = useOperationalContext();
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filters, setFilters] = useState<BandejaFilters>(EMPTY_FILTERS);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setSelectedId(null);
    fetchBandeja()
      .then((rows) => { if (!cancelled) setOrders(rows); })
      .catch(() => { if (!cancelled) setError('No se pudo cargar la bandeja.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedWarehouseId, selectedCustomerId]);

  const options = useMemo(() => {
    const uniq = (vals: string[]) => Array.from(new Set(vals)).sort();
    return { branches: uniq(orders.map((o) => o.branchId)), routes: uniq(orders.map((o) => o.route)) };
  }, [orders]);

  // Si el set recargado ya no contiene el valor filtrado, se resetea a "Todos" solo.
  useEffect(() => {
    setFilters((prev) => {
      const next = { ...prev };
      if (next.branch !== ALL && !options.branches.includes(next.branch)) next.branch = ALL;
      if (next.route !== ALL && !options.routes.includes(next.route)) next.route = ALL;
      return next.branch === prev.branch && next.route === prev.route ? prev : next;
    });
  }, [options]);

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return orders.filter((o) => {
      if (filters.branch !== ALL && o.branchId !== filters.branch) return false;
      if (filters.route !== ALL && o.route !== filters.route) return false;
      if (q && !`${o.id} ${o.ref} ${o.customer} ${o.route} ${o.observations}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, filters]);

  const setFilter = (key: keyof BandejaFilters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  const resetFilters = () => setFilters(EMPTY_FILTERS);
  const filtersActive = filters.branch !== ALL || filters.route !== ALL || filters.query.trim() !== '';
  const selected = orders.find((o) => o.id === selectedId) ?? null;

  return {
    orders: filtered, totalCount: orders.length, loading, error,
    filters, setFilter, resetFilters, filtersActive, options,
    selectedId, setSelectedId, selected, detailOpen, setDetailOpen,
  };
}
