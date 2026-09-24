import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

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
}

type SortDirection = 'asc' | 'desc';

function normalize(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase();
}

function ColumnFilterMenu<T>({
  column,
  data,
  selected,
  onChange,
  onClose,
}: {
  column: DataTableColumn<T>;
  data: T[];
  selected: Set<string> | null;
  onChange: (values: Set<string> | null) => void;
  onClose: () => void;
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

  const filteredValues = uniqueValues.filter((v) => v.toLowerCase().includes(query.toLowerCase()));
  // Sin filtro (selected null) = nada marcado. Marcar un valor = mostrar solo ese;
  // marcar más = sumarlos. Desmarcar el último vuelve a "sin filtro" (null).
  const activeSelection = selected ?? new Set<string>();

  const toggleValue = (value: string) => {
    const next = new Set(activeSelection);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next.size === 0 ? null : next);
  };

  return (
    <div
      ref={ref}
      className="absolute z-20 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-left"
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
}

export default function DataTable<T>({
  data,
  columns,
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
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string> | null>>({});
  const [openFilterKey, setOpenFilterKey] = useState<string | null>(null);
  const paginated = initialPageSize !== undefined;
  const [pageSize, setPageSize] = useState(initialPageSize ?? pageSizeOptions[0]);
  const [page, setPage] = useState(1);

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
    const term = normalize(search);
    return filteredByColumns.filter((row) =>
      columns.some((col) => normalize(col.accessor(row)).includes(term))
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`relative px-4 py-3 font-semibold text-slate-700 whitespace-nowrap ${
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
                        onClick={() => setOpenFilterKey(openFilterKey === col.key ? null : col.key)}
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
                    />
                  )}
                </th>
              ))}
              {actions && (
                <th className="px-4 py-3 font-semibold text-slate-700 text-right whitespace-nowrap">{actionsHeader}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-10 text-center text-slate-400">
                  <i className="ri-loader-4-line animate-spin text-xl"></i>
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {emptyMessage ?? t('table.empty')}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr
                  key={getRowId(row)}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${selectedRowId && getRowId(row) === selectedRowId ? 'bg-teal-50' : ''}`}
                >
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
              ))
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
