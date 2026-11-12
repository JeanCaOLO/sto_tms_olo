// Siguiente número de proforma del país: `PRO-VE-001`, `PRO-CR-001`… Misma convención que las liquidaciones.

export function nextProformaNumber(existing: string[], countryCode?: string | null): string {
  const max = existing.reduce((acc, numero) => {
    const match = /^PRO-(?:[A-Z0-9]+-)?(\d+)$/.exec((numero ?? '').trim());
    const value = match ? Number(match[1]) : 0;
    return Number.isFinite(value) && value > acc ? value : acc;
  }, 0);
  const code = (countryCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code ? `PRO-${code}-${String(max + 1).padStart(3, '0')}` : `PRO-${String(max + 1).padStart(4, '0')}`;
}
