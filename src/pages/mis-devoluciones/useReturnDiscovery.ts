import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getReturnCustomers, getReturnOrderDetail, getReturnOrders,
  type ReturnCustomer, type ReturnDiscoveryPage, type ReturnOrder,
} from './api/solicitudesApi';

type Load<T> = (signal: AbortSignal, cursor?: string) => Promise<ReturnDiscoveryPage<T>>;

function useLookup<T>(load: Load<T> | null, errorMessage: string, delay = 0) {
  const request = useRef<AbortController | null>(null);
  const [state, setState] = useState<{
    source: Load<T>; items: T[]; cursor: string | null; loading: boolean; error: string; failedCursor?: string;
  }>();
  const current = state?.source === load ? state : undefined;

  const run = useCallback((cursor?: string) => {
    if (!load) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(previous => ({
      source: load, items: cursor && previous?.source === load ? previous.items : [],
      cursor: cursor ?? null, loading: true, error: '',
    }));
    void load(controller.signal, cursor).then(page => {
      if (controller.signal.aborted) return;
      setState(previous => ({
        source: load,
        items: cursor && previous?.source === load ? [...previous.items, ...page.items] : page.items,
        cursor: page.next_cursor, loading: false, error: '',
      }));
    }).catch(error => {
      if (controller.signal.aborted) return;
      setState(previous => ({
        source: load, items: previous?.source === load ? previous.items : [],
        cursor: cursor ?? null, loading: false,
        error: error instanceof Error ? error.message : errorMessage, failedCursor: cursor,
      }));
    });
  }, [load, errorMessage]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!load) setState(undefined);
    else if (delay) timer = setTimeout(run, delay);
    else run();
    return () => {
      clearTimeout(timer);
      request.current?.abort();
    };
  }, [load, run, delay]);

  return {
    items: current?.items ?? [],
    loading: !!load && (current?.loading ?? true),
    error: current?.error ?? '',
    hasMore: !!current?.cursor && !current.error,
    more: () => { if (current?.cursor && !current.loading && !current.error) run(current.cursor); },
    retry: () => run(current?.failedCursor),
  };
}

export function useReturnDiscovery(
  enabled: boolean, companyId: string | undefined, customerId: string | undefined,
  orderId: string | undefined, customerQuery: string | null, productCode: string,
) {
  const loadCustomers = useCallback((signal: AbortSignal, cursor?: string) =>
    getReturnCustomers(companyId, customerQuery ?? '', cursor, signal), [companyId, customerQuery]);
  const loadOrders = useCallback((signal: AbortSignal, cursor?: string) =>
    getReturnOrders(companyId, customerId ?? '', productCode, cursor, signal), [companyId, customerId, productCode]);
  const loadOrder = useCallback(async (signal: AbortSignal) => ({
    items: [await getReturnOrderDetail(companyId, customerId ?? '', orderId ?? '', signal)],
    next_cursor: null,
  }), [companyId, customerId, orderId]);

  const customers = useLookup<ReturnCustomer>(
    enabled && customerQuery !== null ? loadCustomers : null, 'No se pudieron cargar los clientes.', customerQuery ? 250 : 0,
  );
  const orders = useLookup<ReturnOrder>(
    enabled && customerId ? loadOrders : null, 'No se pudieron cargar los pedidos.', productCode ? 250 : 0,
  );
  const order = useLookup(enabled && customerId && orderId ? loadOrder : null, 'No se pudo cargar el pedido.');
  return { customers, orders, order };
}
