// Contexto operativo centralizado (País → Almacén → Cliente) — prompt de
// implementación §16/§17. Un solo lugar que sabe qué país/almacén/cliente
// está seleccionado, en vez de pasar countryId/customerId manualmente por
// cada componente. La selección se valida contra los scopes reales del
// usuario (server/domain/context/) — nunca se permite seleccionar algo que
// el backend luego rechazaría.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch as realApiFetch } from '../lib/supabase';
import { MOCK_AUTH_ENABLED, mockContextResponse } from '../lib/mock-auth';
import { MOCK_COUNTRY_IDS } from '../lib/tarifas/data/memory/mockIds';
import { useAuth } from './useAuth';

export interface Country { id: string; code: string; name: string; timezone: string | null }
export interface Warehouse { id: string; country_id: string; code: string; name: string }
export interface Customer { id: string; warehouse_id: string; code: string; name: string }

export interface Scope {
  id: string;
  roleId: string | null;
  countryId: string | null;
  warehouseId: string | null;
  customerId: string | null;
}

interface OperationalContextValue {
  scopes: Scope[];
  isGlobal: boolean;
  loading: boolean;

  countries: Country[];
  warehouses: Warehouse[];
  customers: Customer[];

  selectedCountryId: string | null;
  selectedWarehouseId: string | null;
  selectedCustomerId: string | null;

  selectCountry: (countryId: string | null) => void;
  selectWarehouse: (warehouseId: string | null) => void;
  selectCustomer: (customerId: string | null) => void;
}

const STORAGE_KEY = 'tms_operational_context';

// En modo mock (VITE_MOCK_AUTH, solo dev) no hay backend: el contexto sale de `mock-auth.ts`.
const apiFetch: typeof realApiFetch = async (path, init) =>
  (MOCK_AUTH_ENABLED ? mockContextResponse(path) : null) ?? realApiFetch(path, init);

const OperationalContext = createContext<OperationalContextValue | undefined>(undefined);

// En mock arranca en Costa Rica: el tarifador pide un país activo y "Todos" no sirve para liquidar.
const emptySelection = () => ({ countryId: MOCK_AUTH_ENABLED ? MOCK_COUNTRY_IDS.CR : null, warehouseId: null, customerId: null });

function readPersisted(): { countryId: string | null; warehouseId: string | null; customerId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : emptySelection();
  } catch {
    return emptySelection();
  }
}

function writePersisted(value: { countryId: string | null; warehouseId: string | null; customerId: string | null }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage no disponible — la selección simplemente no persiste entre sesiones
  }
}

export function OperationalContextProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [loading, setLoading] = useState(true);

  const [countries, setCountries] = useState<Country[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const persisted = readPersisted();
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(persisted.countryId);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(persisted.warehouseId);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(persisted.customerId);

  const isGlobal = useMemo(
    () => scopes.some((s) => !s.countryId && !s.warehouseId && !s.customerId),
    [scopes],
  );

  useEffect(() => {
    if (!session) {
      setScopes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch('/v1/me/context')
      .then(({ ok, body }) => {
        if (ok && body?.data?.scopes) setScopes(body.data.scopes);
      })
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    apiFetch('/v1/countries').then(({ ok, body }) => {
      if (ok && body?.data) setCountries(body.data);
    });
  }, [session]);

  // Limpia selecciones inválidas (prompt de implementación §17: "evitar
  // mezclar datos") — si el país seleccionado ya no está entre los
  // permitidos (cambió el scope, o el usuario perdió acceso), se resetea
  // toda la cadena hacia abajo.
  useEffect(() => {
    if (selectedCountryId && countries.length > 0 && !countries.some((c) => c.id === selectedCountryId)) {
      setSelectedCountryId(null);
      setSelectedWarehouseId(null);
      setSelectedCustomerId(null);
    }
  }, [countries, selectedCountryId]);

  useEffect(() => {
    if (!session || !selectedCountryId) {
      setWarehouses([]);
      return;
    }
    apiFetch(`/v1/countries/${selectedCountryId}/warehouses`).then(({ ok, body }) => {
      if (ok && body?.data) setWarehouses(body.data);
      else setWarehouses([]);
    });
  }, [session, selectedCountryId]);

  useEffect(() => {
    if (selectedWarehouseId && warehouses.length > 0 && !warehouses.some((w) => w.id === selectedWarehouseId)) {
      setSelectedWarehouseId(null);
      setSelectedCustomerId(null);
    }
  }, [warehouses, selectedWarehouseId]);

  useEffect(() => {
    if (!session || !selectedWarehouseId) {
      setCustomers([]);
      return;
    }
    apiFetch(`/v1/warehouses/${selectedWarehouseId}/customers`).then(({ ok, body }) => {
      if (ok && body?.data) setCustomers(body.data);
      else setCustomers([]);
    });
  }, [session, selectedWarehouseId]);

  useEffect(() => {
    if (selectedCustomerId && customers.length > 0 && !customers.some((c) => c.id === selectedCustomerId)) {
      setSelectedCustomerId(null);
    }
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    writePersisted({ countryId: selectedCountryId, warehouseId: selectedWarehouseId, customerId: selectedCustomerId });
  }, [selectedCountryId, selectedWarehouseId, selectedCustomerId]);

  const selectCountry = useCallback((countryId: string | null) => {
    setSelectedCountryId(countryId);
    setSelectedWarehouseId(null);
    setSelectedCustomerId(null);
  }, []);

  const selectWarehouse = useCallback((warehouseId: string | null) => {
    setSelectedWarehouseId(warehouseId);
    setSelectedCustomerId(null);
  }, []);

  const selectCustomer = useCallback((customerId: string | null) => {
    setSelectedCustomerId(customerId);
  }, []);

  return (
    <OperationalContext.Provider
      value={{
        scopes, isGlobal, loading,
        countries, warehouses, customers,
        selectedCountryId, selectedWarehouseId, selectedCustomerId,
        selectCountry, selectWarehouse, selectCustomer,
      }}
    >
      {children}
    </OperationalContext.Provider>
  );
}

export function useOperationalContext(): OperationalContextValue {
  const context = useContext(OperationalContext);
  if (!context) {
    throw new Error('useOperationalContext debe usarse dentro de OperationalContextProvider');
  }
  return context;
}
