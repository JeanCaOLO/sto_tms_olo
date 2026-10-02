import { useEffect, useMemo } from 'react';
import Select from '../../../components/base/Select';
import { isGlobalScope, type Option, type ScopeInput } from '../admin/admin-api';
import { useScopeOptions } from '../admin/use-scope-options';

interface ScopeEditorProps {
  scopes: ScopeInput[];
  onChange: (scopes: ScopeInput[]) => void;
}

const GLOBAL: ScopeInput = {};
const EMPTY_ROW: ScopeInput = { country_id: '' };

const toOptions = (items: Option[] | undefined, placeholder: string) => [
  { value: '', label: placeholder },
  ...(items ?? []).map((o) => ({ value: o.id, label: o.name })),
];

// Alcance = DÓNDE opera el usuario (el rol define QUÉ puede hacer). Global = todo.
export default function ScopeEditor({ scopes, onChange }: ScopeEditorProps) {
  const { countries, warehouses, customers, error } = useScopeOptions();
  const isGlobal = scopes.length > 0 && scopes.every(isGlobalScope);
  const rows = useMemo(() => (isGlobal ? [] : scopes), [isGlobal, scopes]);

  const ensureWarehouses = warehouses.ensure;
  const ensureCustomers = customers.ensure;
  useEffect(() => rows.forEach((row) => ensureWarehouses(row.country_id)), [rows, ensureWarehouses]);
  useEffect(() => rows.forEach((row) => ensureCustomers(row.warehouse_id)), [rows, ensureCustomers]);

  const setRow = (index: number, next: ScopeInput) => onChange(rows.map((row, i) => (i === index ? next : row)));
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={isGlobal}
          onChange={(e) => onChange(e.target.checked ? [GLOBAL] : [EMPTY_ROW])}
          className="w-4 h-4 accent-teal-600"
        />
        <span><strong>Global</strong>: acceso a todos los países, almacenes y clientes</span>
      </label>
      {error && <p className="text-xs text-red-600">No se pudieron cargar los países: {error}</p>}
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
          <Select
            label={index === 0 ? 'País' : undefined}
            value={row.country_id ?? ''}
            onChange={(e) => setRow(index, { country_id: e.target.value })}
            options={toOptions(countries, 'Seleccionar país')}
            required
          />
          <Select
            label={index === 0 ? 'Almacén' : undefined}
            value={row.warehouse_id ?? ''}
            onChange={(e) => setRow(index, { country_id: row.country_id, warehouse_id: e.target.value || null })}
            options={toOptions(warehouses.byParent[row.country_id ?? ''], 'Todos los almacenes')}
            disabled={!row.country_id}
          />
          <Select
            label={index === 0 ? 'Cliente' : undefined}
            value={row.customer_id ?? ''}
            onChange={(e) => setRow(index, { ...row, customer_id: e.target.value || null })}
            options={toOptions(customers.byParent[row.warehouse_id ?? ''], 'Todos los clientes')}
            disabled={!row.warehouse_id}
          />
          <button
            type="button"
            onClick={() => removeRow(index)}
            disabled={rows.length === 1}
            className="w-9 h-9 flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 cursor-pointer"
            title="Quitar alcance"
          >
            <i className="ri-delete-bin-line"></i>
          </button>
        </div>
      ))}
      {!isGlobal && (
        <button type="button" onClick={() => onChange([...rows, EMPTY_ROW])} className="text-sm text-teal-700 hover:underline cursor-pointer">
          <i className="ri-add-line"></i> Agregar otro alcance
        </button>
      )}
    </div>
  );
}
