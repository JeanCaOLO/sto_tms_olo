import { useEffect, useMemo, useState } from 'react';

// Paginación cliente compartida por las tablas OMS (Cola, preview del Simulador…).
// Devuelve el slice de la página actual + los controles que consume <Pagination>.
export function usePagination<T>(items: T[], initialSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);

  // Vuelve a la página 1 cuando cambia el conjunto o el tamaño de página.
  useEffect(() => { setPage(1); }, [items.length, pageSize]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = useMemo(() => items.slice(pageStart, pageStart + pageSize), [items, pageStart, pageSize]);

  const goToPage = (p: number) => {
    if (Number.isNaN(p)) return;
    setPage(Math.min(Math.max(1, Math.trunc(p)), totalPages));
  };

  return {
    pageItems, total: items.length,
    page: currentPage, pageSize, setPageSize, goToPage, totalPages, pageStart,
  };
}
