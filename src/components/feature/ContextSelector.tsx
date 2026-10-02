// Selector de contexto operativo (País → Almacén → Cliente) — prompt de
// implementación §17. Empieza en esta fase con los tres niveles pedidos; el
// resto de módulos lo consumirán progresivamente (Fase 6+, no esta fase).

import { useOperationalContext } from '../../hooks/useOperationalContext';

export default function ContextSelector() {
  const {
    countries, warehouses, customers,
    selectedCountryId, selectedWarehouseId, selectedCustomerId,
    selectCountry, selectWarehouse, selectCustomer,
    loading,
  } = useOperationalContext();

  if (loading) {
    return <div className="text-xs text-slate-400 px-3 py-2">Cargando contexto...</div>;
  }

  const selectClass = 'text-sm bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer';

  return (
    <div className="flex items-center gap-2 px-3 py-2" title="Contexto operativo: País, Almacén, Cliente">
      <i className="ri-map-pin-2-line text-teal-600 text-sm"></i>

      <select
        value={selectedCountryId ?? ''}
        onChange={(e) => selectCountry(e.target.value || null)}
        className={selectClass}
        aria-label="País"
      >
        <option value="">Todos los países</option>
        {countries.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {selectedCountryId && (
        <>
          <i className="ri-arrow-right-s-line text-slate-300"></i>
          <select
            value={selectedWarehouseId ?? ''}
            onChange={(e) => selectWarehouse(e.target.value || null)}
            className={selectClass}
            aria-label="Almacén"
          >
            <option value="">Todos los almacenes</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </>
      )}

      {selectedWarehouseId && (
        <>
          <i className="ri-arrow-right-s-line text-slate-300"></i>
          <select
            value={selectedCustomerId ?? ''}
            onChange={(e) => selectCustomer(e.target.value || null)}
            className={selectClass}
            aria-label="Cliente"
          >
            <option value="">Todos los clientes</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
