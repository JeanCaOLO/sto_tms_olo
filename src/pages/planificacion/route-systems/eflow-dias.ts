// Carga la matriz de días de despacho por ruta desde EFLOW (endpoint
// /api/catalogos/rutas-dias), respetando el país activo. Reemplaza el Excel de
// COFERSA. EFLOW (RUTA_DIA_AB) no distingue carga/entrega: si la ruta corre ese
// día se marca 'ambos' (el cuadro verde/rojo); si no, sin actividad.
import type { Row } from './registry';
import { fetchRutasDias } from '../eflow-api';

// ID_DIA de DIA_SEMANA_AB → columna de la matriz. 1=Lunes … 7=Domingo.
const DIA_COL: Record<number, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
  7: 'domingo',
};
const DIA_KEYS = Object.values(DIA_COL);

export async function cargarRutasDias(): Promise<Row[]> {
  const rows = await fetchRutasDias();
  return rows.map((r) => {
    const row: Row = {
      route_code: r.route_code,
      route_name: r.route_name ?? '',
      promesa: r.promesa_horas != null ? `${r.promesa_horas} h` : null,
    };
    for (const k of DIA_KEYS) row[k] = null; // días sin actividad por defecto
    for (const id of String(r.day_ids ?? '').split(',')) {
      const col = DIA_COL[Number(id)];
      if (col) row[col] = 'ambos'; // la ruta corre ese día (carga y entrega)
    }
    return row;
  });
}
