import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { permKeyForPath } from '../feature/module-routes';
import { postAuditEvent } from '../../pages/auditoria/audit-api';
import { matchesSearch } from '../../lib/text';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  // Valor "crudo" usado para ordenar, filtrar y exportar. render() es solo lo que se ve.
  accessor: (row: T) => string | number | boolean | null | undefined;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  align?: 'left' | 'right' | 'center';
  exportValue?: (row: T) => string | number;
  headerClassName?: string;
  cellClassName?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  searchPlaceholder?: string;
  exportFileName?: string;
  actions?: (row: T) => ReactNode;
  actionsHeader?: string;
  emptyMessage?: string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  // Opcional: activa paginación en el cliente (util cuando el volumen de filas es
  // grande). Sin esta prop la tabla muestra todas las filas, como antes.
  pageSize?: number;
  pageSizeOptions?: number[];
  selectedRowId?: string | null;
  // Opcional: se llama tras exportar (para auditar el evento export). Recibe el
  // número de filas exportadas.
  onExport?: (rows: number) => void;
  // Opcional: activa "Columnas" (ocultar y reordenar) y recuerda la elección en este navegador bajo
  // esta clave. Sin ella la tabla se comporta como siempre.
  columnsKey?: string;
  // Columnas ocultas mientras la persona no haya elegido otra cosa (requiere columnsKey).
  defaultHidden?: string[];
  // Opcional: filas que se pueden extender. Si devuelve contenido, la fila lleva un botón para
  // desplegarlo debajo (por ejemplo, el detalle de un viaje).
  renderExpanded?: (row: T) => ReactNode;
  canExpand?: (row: T) => boolean;
  // Opcional: cuántas filas se ven a la vez. Si hay más, la tabla se desplaza por dentro (encabezado
  // fijo) en vez de alargar la pantalla. Sin esta prop la tabla crece con sus filas, como siempre.
  maxVisibleRows?: number;
}

export interface ColumnLayout {
  order: string[];
  hidden: string[];
}

const EMPTY_LAYOUT: ColumnLayout = { order: [], hidden: [] };
const layoutStorageKey = (key: string) => `datatable.columns.${key}`;

function readLayout(key: string | undefined, defaultHidden: string[] = []): ColumnLayout {
  const initial: ColumnLayout = { order: [], hidden: defaultHidden };
  if (!key) return EMPTY_LAYOUT;
  try {
    const raw = localStorage.getItem(layoutStorageKey(key));
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<ColumnLayout>;
    return {
      order: Array.isArray(parsed.order) ? parsed.order.filter((k) => typeof k === 'string') : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((k) => typeof k === 'string') : [],
    };
  } catch {
    return initial;
  }
}

/** Columnas en el orden elegido; las que no estén en el orden guardado (nuevas) van al final. */
function applyColumnLayout<T>(columns: DataTableColumn<T>[], layout: ColumnLayout): DataTableColumn<T>[] {
  const rank = new Map(layout.order.map((k, i) => [k, i]));
  const original = new Map(columns.map((c, i) => [c.key, i]));
  return [...columns].sort((a, b) => {
    const ra = rank.get(a.key) ?? layout.order.length + (original.get(a.key) ?? 0);
    const rb = rank.get(b.key) ?? layout.order.length + (original.get(b.key) ?? 0);
    return ra - rb;
  });
}

type SortDirection = 'asc' | 'desc';

function ColumnFilterMenu<T>({
  column,
  data,
  selected,
  onChange,
  onClose,
  anchor,
}: {
  column: DataTableColumn<T>;
  data: T[];
  selected: Set<string> | null;
  onChange: (values: Set<string> | null) => void;
  onClose: () => void;
  /** Si viene, el menú se dibuja flotando en el <body> bajo este punto (tablas con scroll interno). */
  anchor?: DOMRect | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const { t } = useTranslation();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const uniqueValues = useMemo(() => {
    const set = new Set<string>();
    data.forEach((row) => {
      const raw = column.accessor(row);
      set.add(raw === null || raw === undefined || raw === '' ? '(vacío)' : String(raw));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [data, column]);

  const filteredValues = uniqueValues.filter((v) => matchesSearch(v, query));
  // Sin filtro (selected null) = nada marcado. Marcar un valor = mostrar solo ese;
  // marcar más = sumarlos. Desmarcar el último vuelve a "sin filtro" (null).
  const activeSelection = selected ?? new Set<string>();

  const toggleValue = (value: string) => {
    const next = new Set(activeSelection);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next.size === 0 ? null : next);
  };

  const floating = anchor
    ? { top: anchor.bottom + 4, left: Math.max(8, Math.min(anchor.left, window.innerWidth - 232)) }
    : null;

  const menu = (
    <div
      ref={ref}
      className={`${floating ? 'fixed z-50' : 'absolute z-20'} mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-left`}
      style={floating ?? undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('table.searchValue')}
        className="w-full px-2 py-1 text-xs border border-slate-200 rounded mb-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
      />
      <div className="flex justify-between text-xs text-teal-600 mb-1.5 px-0.5">
        <button className="hover:underline cursor-pointer" onClick={() => onChange(null)}>
          {t('table.selectAll')}
        </button>
        <button className="hover:underline cursor-pointer" onClick={() => onChange(null)}>
          {t('table.clear')}
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {filteredValues.map((value) => (
          <label key={value} className="flex items-center gap-2 text-xs text-slate-700 px-0.5 py-0.5 rounded hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={activeSelection.has(value)}
              onChange={() => toggleValue(value)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="truncate">{value}</span>
          </label>
        ))}
        {filteredValues.length === 0 && (
          <p className="text-xs text-slate-400 px-0.5 py-1">{t('table.noMatches')}</p>
        )}
      </div>
    </div>
  );
  return floating ? createPortal(menu, document.body) : menu;
}

export default function DataTable<T>({
  data,
  columns: allColumns,
  getRowId,
  searchPlaceholder,
  exportFileName = 'exportado',
  actions,
  actionsHeader = 'Acciones',
  emptyMessage,
  loading = false,
  onRowClick,
  pageSize: initialPageSize,
  pageSizeOptions = [10, 25, 50, 100],
  selectedRowId = null,
  onExport,
  columnsKey,
  defaultHidden,
  renderExpanded,
  canExpand,
  maxVisibleRows,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({});
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<DOMRect | null>(null);
  const scrolls = maxVisibleRows !== undefined;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  // El alto real de las N primeras filas (las celdas largas se parten en varias líneas); mientras no
  // se pueda medir, una estimación: encabezado de ~2.75 rem más ~3.25 rem por fila.
  useLayoutEffect(() => {
    if (!scrolls) return;
    const el = scrollerRef.current;
    if (!el) return;
    const rows = Array.from(el.querySelectorAll('tbody > tr')).slice(0, maxVisibleRows);
    const head = el.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const total = head + rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
    const next = rows.length >= maxVisibleRows && total > 0 ? Math.ceil(total) : null;
    setMeasuredHeight((prev) => (prev === next ? prev : next));
  });
  useEffect(() => {
    if (!scrolls) return undefined;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [scrolls]);
  void viewportWidth; // solo fuerza una nueva medición al cambiar el ancho de la ventana
  const scrollStyle = scrolls
    ? { maxHeight: measuredHeight !== null ? `${measuredHeight}px` : `${2.75 + 3.25 * maxVisibleRows}rem` }
    : undefined;
  const stickyTh = scrolls ? ' sticky top-0 z-10 bg-slate-50' : '';
  const paginated = initialPageSize !== undefined;
  const [pageSize, setPageSize] = useState(initialPageSize ?? pageSizeOptions[0]);
  const [page, setPage] = useState(1);
  const [layout, setLayout] = useState<ColumnLayout>(() => readLayout(columnsKey, defaultHidden));
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  // Las columnas que se ven: en el orden elegido y sin las ocultas. Siempre queda al menos una.
  const orderedAll = useMemo(() => applyColumnLayout(allColumns, layout), [allColumns, layout]);
  const columns = useMemo(() => {
    const visible = orderedAll.filter((c) => !layout.hidden.includes(c.key));
    return visible.length > 0 ? visible : orderedAll.slice(0, 1);
  }, [orderedAll, layout.hidden]);

  const saveLayout = (next: ColumnLayout) => {
    setLayout(next);
    if (!columnsKey) return;
    try {
      localStorage.setItem(layoutStorageKey(columnsKey), JSON.stringify(next));
    } catch {
      // Sin almacenamiento: la elección vale solo mientras la pantalla esté abierta.
    }
  };
  const toggleHidden = (key: string) => {
    const hidden = layout.hidden.includes(key) ? layout.hidden.filter((k) => k !== key) : [...layout.hidden, key];
    if (hidden.length >= allColumns.length) return; // no se ocultan todas
    saveLayout({ ...layout, order: orderedAll.map((c) => c.key), hidden });
  };
  const moveColumn = (key: string, toKey: string) => {
    if (key === toKey) return;
    const keys = orderedAll.map((c) => c.key);
    const from = keys.indexOf(key);
    const to = keys.indexOf(toKey);
    if (from < 0 || to < 0) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    saveLayout({ ...layout, order: keys });
  };
  const shiftColumn = (key: string, delta: -1 | 1) => {
    const keys = orderedAll.map((c) => c.key);
    const i = keys.indexOf(key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    saveLayout({ ...layout, order: keys });
  };

  useEffect(() => {
    if (!columnsMenuOpen) return undefined;
    const handler = (e: MouseEvent) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setColumnsMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [columnsMenuOpen]);

  const toggleExpanded = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const expandable = !!renderExpanded;
  const spanAll = columns.length + (actions ? 1 : 0) + (expandable ? 1 : 0);

  const filteredByColumns = useMemo(() => {
    return data.filter((row) =>
      columns.every((col) => {
        const selection = columnFilters[col.key];
        if (!selection) return true; // sin filtro activo en esta columna
        const raw = col.accessor(row);
        const value = raw === null || raw === undefined || raw === '' ? '(vacío)' : String(raw);
        return selection.has(value);
      })
    );
  }, [data, columns, columnFilters]);

  const searched = useMemo(() => {
    if (!search.trim()) return filteredByColumns;
    return filteredByColumns.filter((row) =>
      columns.some((col) => matchesSearch(col.accessor(row), search))
    );
  }, [filteredByColumns, search, columns]);

  const sorted = useMemo(() => {
    if (!sort) return searched;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return searched;
    const copy = [...searched];
    copy.sort((a, b) => {
      const va = col.accessor(a);
      const vb = col.accessor(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [searched, sort, columns]);

  useEffect(() => {
    setPage(1);
  }, [search, columnFilters, sort, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleRows = paginated ? sorted.slice(pageStart, pageStart + pageSize) : sorted;

  const goToPage = (p: number) => {
    if (Number.isNaN(p)) return;
    setPage(Math.min(Math.max(1, Math.trunc(p)), totalPages));
  };

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  const handleExport = () => {
    const rows = sorted.map((row) => {
      const record: Record<string, string | number> = {};
      columns.forEach((col) => {
        const value = col.exportValue ? col.exportValue(row) : col.accessor(row);
        record[col.header] = value === null || value === undefined ? '' : (value as string | number);
      });
      return record;
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `${exportFileName}-${stamp}.xlsx`);
    // Auditoría del export: automática por ruta. Si la pantalla pasa onExport,
    // ese override manda (y se hace cargo de auditar por su cuenta).
    if (onExport) {
      onExport(rows.length);
    } else {
      const permKey = permKeyForPath(location.pathname);
      if (permKey) postAuditEvent('export', permKey, { rows: rows.length, format: 'xlsx' });
    }
  };

  const activeFilterCount = Object.values(columnFilters).filter((v) => v !== undefined && v !== null).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100 bg-white/70 backdrop-blur-sm">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-slate-400">
            <i className="ri-search-line text-sm"></i>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder ?? t('table.search')}
            className="w-full pl-10 pr-4 py-2 text-sm bg-white/80 backdrop-blur border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
          />
        </div>
        <div className="flex items-center gap-3">
          {activeFilterCount > 0 && (
            <button
              onClick={() => setColumnFilters({})}
              className="text-xs text-teal-600 hover:underline cursor-pointer whitespace-nowrap"
            >
              {t('table.clearFilters')}
            </button>
          )}
          <span className="text-xs text-slate-400 whitespace-nowrap">{t('table.records', { count: sorted.length })}</span>
          {columnsKey && (
            <div className="relative" ref={columnsMenuRef}>
              <button
                type="button"
                onClick={() => setColumnsMenuOpen((open) => !open)}
                aria-expanded={columnsMenuOpen}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-layout-column-line"></i>
                Columnas
                {layout.hidden.length > 0 && (
                  <span className="text-[10px] bg-teal-100 text-teal-700 rounded-full px-1.5">{layout.hidden.length} ocultas</span>
                )}
              </button>
              {columnsMenuOpen && (
                <div className="absolute right-0 z-30 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-left">
                  <div className="flex items-center justify-between px-1 pb-1.5 text-xs text-slate-500">
                    <span>Mostrar y ordenar</span>
                    <button
                      type="button"
                      className="text-teal-600 hover:underline cursor-pointer"
                      onClick={() => saveLayout({ order: [], hidden: defaultHidden ?? [] })}
                    >
                      Restablecer
                    </button>
                  </div>
                  <ul className="max-h-72 overflow-y-auto space-y-0.5">
                    {orderedAll.map((col, i) => {
                      const hidden = layout.hidden.includes(col.key);
                      return (
                        <li
                          key={col.key}
                          className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={!hidden}
                            onChange={() => toggleHidden(col.key)}
                            aria-label={`Mostrar ${col.header}`}
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                          <span className={`flex-1 truncate text-xs ${hidden ? 'text-slate-400' : 'text-slate-700'}`}>{col.header}</span>
                          <button
                            type="button"
                            disabled={i === 0}
                            onClick={() => shiftColumn(col.key, -1)}
                            aria-label={`Subir ${col.header}`}
                            className="w-5 h-5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          >
                            <i className="ri-arrow-up-s-line"></i>
                          </button>
                          <button
                            type="button"
                            disabled={i === orderedAll.length - 1}
                            onClick={() => shiftColumn(col.key, 1)}
                            aria-label={`Bajar ${col.header}`}
                            className="w-5 h-5 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          >
                            <i className="ri-arrow-down-s-line"></i>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-[11px] text-slate-400 px-1 pt-1.5">También podés arrastrar el título de una columna.</p>
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleExport}
            disabled={sorted.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <i className="ri-file-excel-2-line"></i>
            {t('table.export')}
          </button>
        </div>
      </div>

      <div ref={scrollerRef} className={scrolls ? 'overflow-auto' : 'overflow-x-auto'} style={scrollStyle}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {expandable && <th className={`w-8 px-2 py-3${stickyTh}`} aria-label="Extender"></th>}
              {columns.map((col) => (
                <th
                  key={col.key}
                  draggable={!!columnsKey}
                  onDragStart={columnsKey ? () => setDragKey(col.key) : undefined}
                  onDragOver={columnsKey ? (e) => { if (dragKey) e.preventDefault(); } : undefined}
                  onDrop={columnsKey ? () => { if (dragKey) moveColumn(dragKey, col.key); setDragKey(null); } : undefined}
                  onDragEnd={columnsKey ? () => setDragKey(null) : undefined}
                  className={`relative${stickyTh} px-4 py-3 font-semibold text-slate-700 whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${col.headerClassName ?? ''}`}
                >
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      disabled={!col.sortable}
                      onClick={() => col.sortable && toggleSort(col.key)}
                      className={`inline-flex items-center gap-1 ${col.sortable ? 'cursor-pointer hover:text-teal-600' : 'cursor-default'}`}
                    >
                      {col.header}
                      {col.sortable && (
                        <span className="flex flex-col leading-none text-[10px] -space-y-0.5">
                          <i className={`ri-arrow-up-s-fill ${sort?.key === col.key && sort.direction === 'asc' ? 'text-teal-600' : 'text-slate-300'}`}></i>
                          <i className={`ri-arrow-down-s-fill ${sort?.key === col.key && sort.direction === 'desc' ? 'text-teal-600' : 'text-slate-300'}`}></i>
                        </span>
                      )}
                    </button>
                    {col.filterable && (
                      <button
                        type="button"
                        onClick={(e) => {
                          setFilterAnchor(scrolls ? e.currentTarget.getBoundingClientRect() : null);
                          setOpenFilterKey(openFilterKey === col.key ? null : col.key);
                        }}
                        className={`cursor-pointer ${columnFilters[col.key] ? 'text-teal-600' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        <i className="ri-filter-3-fill text-xs"></i>
                      </button>
                    )}
                  </div>
                  {col.filterable && openFilterKey === col.key && (
                    <ColumnFilterMenu
                      column={col}
                      data={data}
                      selected={columnFilters[col.key] ?? null}
                      onChange={(values) => setColumnFilters((prev) => ({ ...prev, [col.key]: values }))}
                      onClose={() => setOpenFilterKey(null)}
                      anchor={scrolls ? filterAnchor : null}
                    />
                  )}
                </th>
              ))}
              {actions && (
                <th className={`px-4 py-3 font-semibold text-slate-700 text-right whitespace-nowrap${stickyTh}`}>{actionsHeader}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={spanAll} className="px-4 py-10 text-center text-slate-400">
                  <i className="ri-loader-4-line animate-spin text-xl"></i>
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={spanAll} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {emptyMessage ?? t('table.empty')}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const rowId = getRowId(row);
                const isOpen = expandable && expanded.has(rowId);
                const rowCanExpand = expandable && (canExpand ? canExpand(row) : true);
                return (
                <Fragment key={rowId}>
                <tr
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${selectedRowId && rowId === selectedRowId ? 'bg-teal-50' : ''}`}
                >
                  {expandable && (
                    <td className="w-8 px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {rowCanExpand && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(rowId)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Contraer' : 'Extender'}
                          title={isOpen ? 'Contraer' : 'Extender para ver el detalle'}
                          className="w-6 h-6 rounded text-slate-500 hover:bg-slate-100 cursor-pointer"
                        >
                          <i className={isOpen ? 'ri-subtract-line' : 'ri-add-line'}></i>
                        </button>
                      )}
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-slate-700 ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      } ${col.cellClassName ?? ''}`}
                    >
                      {col.render ? col.render(row) : String(col.accessor(row) ?? '—')}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">{actions(row)}</div>
                    </td>
                  )}
                </tr>
                {isOpen && renderExpanded && (
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <td colSpan={spanAll} className="px-4 py-3">{renderExpanded(row)}</td>
                  </tr>
                )}
                </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {paginated && sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-t border-slate-100">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>{t('table.rowsPerPage')}</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
              aria-label="Filas por página"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>{t('table.perPage')} · {t('table.records', { count: sorted.length })}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="hidden sm:inline">
              {pageStart + 1}–{Math.min(pageStart + visibleRows.length, sorted.length)} de {sorted.length}
            </span>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              aria-label="Página anterior"
            >
              <i className="ri-arrow-left-s-line"></i>
            </button>
            <div className="flex items-center gap-1.5">
              <span>{t('table.page')}</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => goToPage(Number(e.target.value))}
                className="w-14 px-2 py-1 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                aria-label="Número de página"
              />
              <span>{t('table.of')} {totalPages}</span>
            </div>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              aria-label="Página siguiente"
            >
              <i className="ri-arrow-right-s-line"></i>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
