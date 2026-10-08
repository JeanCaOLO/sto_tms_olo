// Moneda con la que se liquida un país.
//
// El catálogo de países (`countries.currency`, tabla compartida que el tarifador solo lee) tiene a
// Costa Rica en USD, pero todo lo que se carga y se liquida allá —tarifarios, estructuras de costos,
// reglas, tarifas— está en colones. Mostrar `$` y "USD" sobre importes en colones es un error de
// lectura, no de cálculo (el motor no convierte monedas).
//
// Mientras el catálogo no se corrija en su origen, se corrige acá, en UN solo lugar, y solo si el
// catálogo trae la moneda equivocada. Cuando `countries.currency` de Costa Rica sea CRC, esta tabla
// deja de hacer algo y se puede borrar.

const CURRENCY_BY_COUNTRY: Record<string, { wrong: string; right: string }> = {
  CR: { wrong: 'USD', right: 'CRC' },
};

/** Moneda de liquidación del país `code` (ISO-2), dada la que trae el catálogo. */
export function settlementCurrency(code: string | null | undefined, catalogCurrency: string): string {
  const fix = code ? CURRENCY_BY_COUNTRY[code.toUpperCase()] : undefined;
  return fix && catalogCurrency === fix.wrong ? fix.right : catalogCurrency;
}
