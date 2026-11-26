import { useEffect, useId, useRef, useState } from 'react';
import Button from '../../../components/base/Button';
import { NAME_LIMIT } from '../../../lib/devoluciones/solicitudes';
import type { ReturnCustomer } from '../api/solicitudesApi';

interface Props {
  selected?: ReturnCustomer;
  query: string | null;
  disabled: boolean;
  items: ReturnCustomer[];
  loading: boolean;
  error: string;
  hasMore: boolean;
  more: () => void;
  retry: () => void;
  onQueryChange: (query: string | null) => void;
  onSelect: (customer: ReturnCustomer) => void;
}

export default function ReturnCustomerAutocomplete({
  selected, query, disabled, items, loading, error, hasMore, more, retry, onQueryChange, onSelect,
}: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const input = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState(-1);
  const expanded = query !== null && !disabled;
  const active = expanded && items[index] ? `${listId}-${index}` : undefined;

  useEffect(() => {
    if (active) document.getElementById(active)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const close = () => {
    setIndex(-1);
    onQueryChange(null);
  };
  const open = () => { if (query === null) onQueryChange(''); };

  const choose = (customer: ReturnCustomer) => {
    onSelect(customer);
    close();
  };

  return <div onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) close();
  }}>
    <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">Cliente final *</label>
    <input ref={input} id={id} role="combobox" type="text" aria-required="true"
      aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-autocomplete="list"
      aria-activedescendant={active} autoComplete="off" maxLength={NAME_LIMIT} disabled={disabled}
      placeholder={selected?.name ?? 'Escribe parte del nombre del cliente'}
      value={expanded ? query ?? '' : selected?.name ?? ''}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50"
      onFocus={open}
      onClick={open}
      onChange={event => { setIndex(-1); onQueryChange(event.target.value); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          open();
          if (items.length) setIndex(current => event.key === 'ArrowDown'
            ? Math.min(current + 1, items.length - 1) : current < 0 ? items.length - 1 : Math.max(current - 1, 0));
        } else if (event.key === 'Enter') {
          event.preventDefault();
          if (expanded && items[index]) choose(items[index]);
          else open();
        } else if (event.key === 'Escape' && expanded) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}/>
    {expanded && <div className="mt-1 rounded-lg border border-slate-200 bg-white shadow-sm">
      <ul id={listId} role="listbox" aria-label="Clientes disponibles" aria-busy={loading}
        className="max-h-52 overflow-y-auto">
        {items.map((customer, position) => <li key={customer.id} id={`${listId}-${position}`}
          role="option" aria-selected={position === index}
          className={`cursor-pointer break-words px-3 py-2 text-sm ${position === index ? 'bg-teal-50 text-teal-900' : 'text-slate-800 hover:bg-slate-50'}`}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(customer)}>
          {customer.name}
        </li>)}
      </ul>
      {loading && <p role="status" className="px-3 py-2 text-sm text-slate-600">Buscando clientes…</p>}
      {error && <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span role="alert" className="text-sm text-red-700">{error}</span>
        <Button type="button" size="sm" variant="secondary" onClick={() => { retry(); input.current?.focus(); }}>Reintentar</Button>
      </div>}
      {!loading && !error && !items.length &&
        <p role="status" className="px-3 py-2 text-sm text-slate-600">No se encontraron clientes.</p>}
      {hasMore && <div className="border-t border-slate-100 px-3 py-2">
        <Button type="button" size="sm" variant="secondary" disabled={loading}
          onClick={() => { more(); input.current?.focus(); }}>Cargar más clientes</Button>
      </div>}
    </div>}
  </div>;
}
