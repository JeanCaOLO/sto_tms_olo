import { useEffect, useMemo, useState } from 'react';
import { omsApi } from '../api/omsApi';
import { useOperationalContext } from '../../../hooks/useOperationalContext';
import type { QueueOrder } from '../types';

const ALL = 'todos';

// Almacén y Compañía NO van acá: los maneja el contexto operativo del header
// (País → Almacén → Cliente), que filtra los pedidos en el servidor por scope.
export interface ColaFilters {
  branch: string;
  route: string;
  tier: string;
  query: string;
}

const EMPTY_FILTERS: ColaFilters = {
  branch: ALL, route: ALL, tier: ALL, query: '',
};

// La Cola solo muestra los pedidos PLANIFICADOS, priorizados pero AÚN NO LIBERADOS
// a eFlow (ADR-013): planificados (`planning_run_id` no nulo, lo filtra `getQueue`),
// priorización hecha (`prioritization_run_id`) y sin liberar (`oms_processed_at` /
// situación != GENE). Los liberados salen por `!released`. Nota: la situación (TPEXSI)
// puede no ser DISP aunque el pedido siga pendiente —Planificación la pisa desde eFlow
// (salientes)— por eso NO se filtra por situación: el filtro de cola es planning_run_id.
export function esCola(o: QueueOrder): boolean {
  // Está en la cola si tiene una prioridad que mostrar (Cofersa priorizada por el OMS,
  // o EPA con su prioridad de EFLOW) y aún no fue liberado a eFlow.
  return o.priority != null && !o.released;
}

// Ventana de la Cola: solo se muestran los pedidos cuya fecha de ENTREGA está a lo
// sumo a 3 días de hoy, SIN contar hoy (hoy = 0, mañana = 1 … entrega a 3 días = 3).
// Si faltan MÁS de 3 días para la entrega, el pedido aún no es de la cola (irá en
// otra vista, por diseñar). Los vencidos/para hoy (días ≤ 0) sí se muestran: ya
// pasaron o están en su ventana de preparación (regla T-1).
const MAX_DIAS_ANTELACION = 3;

function diasHastaEntrega(deliveryIso: string, hoyIso: string): number | null {
  const d = deliveryIso?.slice(0, 10);
  if (!d) return null;
  const entrega = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const hoy = Date.UTC(+hoyIso.slice(0, 4), +hoyIso.slice(5, 7) - 1, +hoyIso.slice(8, 10));
  return Math.round((entrega - hoy) / 86400000);
}

// `dispatchDate` del QueueOrder trae la fecha de entrega (row.delivery_date).
function dentroVentanaCola(o: QueueOrder, hoyIso: string): boolean {
  const dias = diasHastaEntrega(o.dispatchDate, hoyIso);
  if (dias == null) return false;
  return dias <= MAX_DIAS_ANTELACION;
}

// Controller de la Cola de Priorización (FR2/FR3). Maneja filtros, selección de
// pedido y la liberación manual del pedido (única intervención humana, vía backend).
export function useColaController() {
  const country = 'CR' as const;
  const { selectedCountryId, selectedWarehouseId, selectedCustomerId, warehouses } = useOperationalContext();
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [liberarOpen, setLiberarOpen] = useState(false);
  const [liberando, setLiberando] = useState(false);
  const [liberarError, setLiberarError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
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
      .then((rows) => {
        if (cancelled) return;
        const hoyIso = new Date().toISOString().slice(0, 10);
        setOrders(rows.filter((o) => esCola(o) && dentroVentanaCola(o, hoyIso)));
      })
      .catch(() => { if (!cancelled) setError('No se pudo cargar la cola.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedWarehouseId, selectedCustomerId, countryWarehouseIds, reloadKey]);

  // Opciones de filtro derivadas de los pedidos cargados.
  const options = useMemo(() => {
    const uniq = (vals: string[]) => Array.from(new Set(vals)).sort();
    return {
      branches: uniq(orders.map((o) => o.branchId)),
      routes: uniq(orders.map((o) => o.route)),
      // Prioridades presentes en la cola (solo las realmente priorizadas tienen número).
      tiers: uniq(orders.filter((o) => o.priority != null).map((o) => String(o.priority))),
    };
  }, [orders]);

  // Al cambiar el conjunto cargado (p. ej. se cambió el cliente del header),
  // un filtro cuyo valor ya no existe entre las opciones dejaría la tabla vacía
  // "pegada" (ej.: Estado OMS=Priorizado al pasar a una compañía sin pendientes).
  // Se resetea a "Todos" automáticamente para no tener que limpiarlo a mano.
  useEffect(() => {
    const available: Record<string, string[]> = {
      branch: options.branches, route: options.routes, tier: options.tiers,
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
      if (filters.tier !== ALL && String(o.priority ?? '') !== filters.tier) return false;
      if (q && !`${o.id} ${o.ref} ${o.customer} ${o.route} ${o.observations}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, filters]);

  const setFilter = (key: keyof ColaFilters, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const resetFilters = () => setFilters(EMPTY_FILTERS);
  const filtersActive =
    filters.branch !== ALL || filters.route !== ALL || filters.tier !== ALL ||
    filters.query.trim() !== '';

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  // Liberar pedido (FR4, DECIDED 2026-11-04): única intervención manual. Llama al backend
  // (Cofersa → prioridad 0 + GENE; EPA conserva la suya) y recarga la cola: el liberado
  // sale porque queda `released`. Sin recálculo local de score ni reordenamiento.
  const liberarPedido = async (motivo: string) => {
    if (!selected) return;
    setLiberando(true);
    setLiberarError(null);
    try {
      await omsApi.liberarPedidos([selected.ref], motivo || undefined);
      setLiberarOpen(false);
      setSelectedId(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setLiberarError(e instanceof Error ? e.message : 'No se pudo liberar el pedido.');
    } finally {
      setLiberando(false);
    }
  };
  const abrirLiberar = () => { setLiberarError(null); setLiberarOpen(true); };
  return {
    // `orders` es el set FILTRADO completo (sin paginar) - DataTable hace su
    // propia paginación/orden/búsqueda internamente (ver src/components/base/DataTable.tsx);
    // pasarle un slice ya paginado desde acá rompía su selector de tamaño de página.
    orders: filtered, totalCount: orders.length, loading, error,
    filters, setFilter, resetFilters, filtersActive, options,
    selectedId, setSelectedId, selected,
    detailOpen, setDetailOpen,
    liberarOpen, setLiberarOpen, abrirLiberar, liberarPedido, liberando, liberarError,
  };
}
