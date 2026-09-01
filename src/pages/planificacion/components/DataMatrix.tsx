import { useEffect, useMemo, useRef, useState } from 'react';
import type { Align, ColumnDef, Row } from '../route-systems/registry';

interface Props {
  caption: string;
  columns: ColumnDef[];
  rows: Row[];
  /** 0 = sin paginar. */
  pageSize: number;
  /** Se resetea la página a 1 cuando cambia (p. ej. al filtrar). */
  resetKey: string;
}

const cell = (v: Row[string]) =>
  v === null || v === undefined || v === '' ? <span className="text-slate-300">—</span> : String(v);

// Celda de día COFERSA: X verde = carga, X roja = entrega, vacío = ninguno.
function DiaCell({ estado }: { estado: Row[string] }) {
  if (estado === 'carga') {
    return (
      <span className="text-green-600 font-bold" title="Día de carga" aria-label="Carga">
        <span aria-hidden="true">✕</span>
      </span>
    );
  }
  if (estado === 'entrega') {
    return (
      <span className="text-red-600 font-bold" title="Día de entrega" aria-label="Entrega">
        <span aria-hidden="true">✕</span>
      </span>
    );
  }
  return <span className="text-slate-200" aria-label="Sin actividad">·</span>;
}

const alignClass = (a?: Align) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

export default function DataMatrix({ caption, columns, rows, pageSize, resetKey }: Props) {
  const [page, setPage] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => setPage(1), [resetKey]);

  const pages = pageSize ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  const current = Math.min(page, pages);
  const visible = useMemo(
    () => (pageSize ? rows.slice((current - 1) * pageSize, current * pageSize) : rows),
    [rows, pageSize, current],
  );

  const go = (n: number) => {
    setPage(n);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  return (
    <div>
      <div
        ref={scrollRef}
        role="region"
        aria-label={`Tabla: ${caption}`}
        tabIndex={0}
        className="overflow-auto max-h-[65vh] border border-slate-200 rounded-lg"
      >
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">{`${caption} — ${rows.length} filas`}</caption>
          <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`px-3 py-2 font-medium text-slate-500 whitespace-nowrap border-b border-slate-300 ${alignClass(c.align)}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    title={c.grow ? String(row[c.key] ?? '') : undefined}
                    className={`px-3 py-1.5 text-slate-700 align-top ${alignClass(c.align)} ${
                      c.mono ? 'font-mono text-xs' : ''
                    } ${c.grow ? 'max-w-[22rem] truncate' : 'whitespace-nowrap'}`}
                  >
                    {c.kind === 'dia' ? <DiaCell estado={row[c.key]} /> : cell(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageSize > 0 && pages > 1 && (
        <nav
          aria-label="Paginación de la tabla"
          className="flex items-center justify-end gap-3 mt-3 text-sm text-slate-600"
        >
          <button
            onClick={() => go(current - 1)}
            disabled={current <= 1}
            className="px-3 py-1.5 rounded-md border border-slate-200 disabled:opacity-40 hover:bg-slate-50 cursor-pointer disabled:cursor-default"
          >
            <i className="ri-arrow-left-s-line"></i> Anterior
          </button>
          <span aria-live="polite">
            Página {current} de {pages}
          </span>
          <button
            onClick={() => go(current + 1)}
            disabled={current >= pages}
            className="px-3 py-1.5 rounded-md border border-slate-200 disabled:opacity-40 hover:bg-slate-50 cursor-pointer disabled:cursor-default"
          >
            Siguiente <i className="ri-arrow-right-s-line"></i>
          </button>
        </nav>
      )}
    </div>
  );
}
