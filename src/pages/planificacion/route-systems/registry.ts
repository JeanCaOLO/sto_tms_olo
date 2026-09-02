// Registro config-driven de sistemas de rutas/programación de viajes.
//
// Añadir un 3er sistema = 1) generar su JSON en `public/data/route-systems/`
// (ver scripts/build-route-systems.ts) y 2) añadir una entrada aquí. Sin tocar
// el componente ni la página.

export type { Row, Cell } from './parse';

export type Align = 'left' | 'right' | 'center';

export interface ColumnDef {
  key: string;
  label: string;
  align?: Align; // default 'left'
  mono?: boolean; // fuente monoespaciada (IDs largos)
  grow?: boolean; // puede envolver / ocupar el ancho sobrante
  /** 'dia' = celda de carga/entrega (X verde/roja). Default: texto. */
  kind?: 'dia';
}

export interface RouteSystem {
  id: string;
  label: string;
  /** Fichero bajo `public/data/route-systems/`. */
  file: string;
  description: string;
  columns: ColumnDef[];
  /** Filas por página. 0 = sin paginar (sistemas pequeños). */
  pageSize: number;
  /** Contiene datos personales reales (nombres de conductores, etc.). */
  hasPII?: boolean;
}

export const ROUTE_SYSTEMS: RouteSystem[] = [
  {
    id: 'cofersa',
    label: 'COFERSA',
    file: 'cofersa.json',
    description: 'Zonas de reparto COFERSA y su calendario semanal.',
    pageSize: 0,
    columns: [
      { key: 'zona', label: 'Zona' },
      { key: 'categoria', label: 'Categoría' },
      { key: 'lunes', label: 'Lunes', align: 'center', kind: 'dia' },
      { key: 'martes', label: 'Martes', align: 'center', kind: 'dia' },
      { key: 'miercoles', label: 'Miércoles', align: 'center', kind: 'dia' },
      { key: 'jueves', label: 'Jueves', align: 'center', kind: 'dia' },
      { key: 'viernes', label: 'Viernes', align: 'center', kind: 'dia' },
      { key: 'sabado', label: 'Sábado', align: 'center', kind: 'dia' },
    ],
  },
  {
    id: 'asignacion-viajes',
    label: 'Asignación de Viajes',
    file: 'programacion-viajes.json',
    description:
      'Programación de viajes por fecha, destino (estado), localidad y conductor, con los números de viaje de Febeca Patio / Febeca Bulto / Sillaca / Beval y Viaje WMH.',
    pageSize: 50,
    hasPII: true,
    columns: [
      { key: 'mes', label: 'Mes' },
      { key: 'fecha', label: 'Fecha asig.', align: 'right' },
      { key: 'destino', label: 'Destino' },
      { key: 'localidad', label: 'Localidad' },
      { key: 'conductor', label: 'Conductor' },
      { key: 'prioridad', label: 'Prioridad', align: 'right' },
      { key: 'puertaCarga', label: 'Puerta', align: 'right' },
      { key: 'febecaPatio', label: 'Febeca Patio', mono: true },
      { key: 'febecaBulto', label: 'Febeca Bulto', mono: true },
      { key: 'sillaca', label: 'Sillaca', mono: true },
      { key: 'beval', label: 'Beval', mono: true },
      { key: 'viajeWmh', label: 'Viaje WMH', mono: true },
      { key: 'guiasAdicionales', label: 'Guías adicionales', grow: true },
    ],
  },
];

export function getRouteSystem(id: string): RouteSystem | undefined {
  return ROUTE_SYSTEMS.find((s) => s.id === id);
}
