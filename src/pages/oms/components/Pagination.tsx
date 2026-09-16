// Barra de paginación compartida por las tablas OMS. El marcado es el mismo que
// tenía inline la Cola de Priorización; ahora se reusa (Cola, preview del Simulador…).
export default function Pagination({
  page, pageSize, setPageSize, goToPage, totalPages, pageStart, total, shown, noun = 'registros',
  sizes = [5, 10, 25, 50, 100],
}: {
  page: number;
  pageSize: number;
  setPageSize: (n: number) => void;
  goToPage: (p: number) => void;
  totalPages: number;
  pageStart: number;
  total: number;
  shown: number;        // filas visibles en la página actual
  noun?: string;
  sizes?: number[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-t border-slate-100">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span>Mostrar</span>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="px-2 py-1 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
          aria-label={`${noun} por página`}
        >
          {sizes.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span>por página · {total} {noun}</span>
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span className="hidden sm:inline">
          {pageStart + 1}–{Math.min(pageStart + shown, total)} de {total}
        </span>
        <button
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Página anterior"
        >
          <i className="ri-arrow-left-s-line"></i>
        </button>
        <div className="flex items-center gap-1.5">
          <span>Página</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={page}
            onChange={(e) => goToPage(Number(e.target.value))}
            className="w-14 px-2 py-1 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-label="Número de página"
          />
          <span>de {totalPages}</span>
        </div>
        <button
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Página siguiente"
        >
          <i className="ri-arrow-right-s-line"></i>
        </button>
      </div>
    </div>
  );
}
