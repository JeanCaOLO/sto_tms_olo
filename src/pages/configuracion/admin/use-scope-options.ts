import { useCallback, useEffect, useRef, useState } from 'react';
import { listCountries, listCustomers, listWarehouses, type Option } from './admin-api';

type Loader = (parentId: string) => Promise<Option[]>;

// Cache por padre: varias filas de alcance comparten los mismos almacenes/clientes.
function useChildOptions(load: Loader) {
  const [byParent, setByParent] = useState<Record<string, Option[]>>({});
  const requested = useRef(new Set<string>());

  const ensure = useCallback(
    (parentId: string | null | undefined) => {
      if (!parentId || requested.current.has(parentId)) return;
      requested.current.add(parentId);
      load(parentId)
        .then((options) => setByParent((prev) => ({ ...prev, [parentId]: options })))
        .catch(() => requested.current.delete(parentId));
    },
    [load],
  );

  return { byParent, ensure };
}

export function useScopeOptions() {
  const [countries, setCountries] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const warehouses = useChildOptions(listWarehouses);
  const customers = useChildOptions(listCustomers);

  useEffect(() => {
    listCountries()
      .then(setCountries)
      .catch((err: Error) => setError(err.message));
  }, []);

  return { countries, warehouses, customers, error };
}
