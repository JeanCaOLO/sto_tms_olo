export type RutaEstado = 'programada' | 'hoy' | 'completada';

export interface EstadoInfo {
  estado: RutaEstado;
  label: string;
  variant: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

// ponytail: sin campo de estado real en el store mock, se deriva de la fecha; migrar a estado
// persistido cuando "Rutas Generadas" lea de una tabla `routes` real.
export function estadoDeRuta(fechaRuta: string): EstadoInfo {
  const hoy = new Date().toISOString().split('T')[0];
  if (fechaRuta < hoy) return { estado: 'completada', label: 'Completada', variant: 'success' };
  if (fechaRuta === hoy) return { estado: 'hoy', label: 'Hoy', variant: 'warning' };
  return { estado: 'programada', label: 'Programada', variant: 'info' };
}

// Estado operativo de una secuencia de paradas generada, distinto del badge
// derivado de la fecha (arriba): éste lo fija la persona a mano y se persiste.
// "secuencia" evita "ruta"/"viaje", que son conceptos de la BD.
export type EstadoSecuencia = 'activa' | 'completada' | 'cancelada';

export interface EstadoSecuenciaInfo {
  estado: EstadoSecuencia;
  label: string;
  variant: 'info' | 'success' | 'danger';
  icon: string;
}

export const ESTADO_SECUENCIA_DEFAULT: EstadoSecuencia = 'activa';

export const ESTADOS_SECUENCIA: EstadoSecuenciaInfo[] = [
  { estado: 'activa', label: 'Activa', variant: 'info', icon: 'ri-truck-line' },
  { estado: 'completada', label: 'Completada', variant: 'success', icon: 'ri-checkbox-circle-line' },
  { estado: 'cancelada', label: 'Cancelada', variant: 'danger', icon: 'ri-close-circle-line' },
];

export function infoEstadoSecuencia(estado?: EstadoSecuencia): EstadoSecuenciaInfo {
  return ESTADOS_SECUENCIA.find((e) => e.estado === estado) ?? ESTADOS_SECUENCIA[0];
}

// Filtro de lista por estado operativo. 'todas' = sin filtro.
export type FiltroEstadoSecuencia = EstadoSecuencia | 'todas';

export const FILTROS_ESTADO_SECUENCIA: { valor: FiltroEstadoSecuencia; label: string }[] = [
  { valor: 'todas', label: 'Todas' },
  { valor: 'activa', label: 'Activas' },
  { valor: 'completada', label: 'Completadas' },
  { valor: 'cancelada', label: 'Canceladas' },
];

// Un registro sin `estado` cuenta como 'activa' (misma regla que infoEstadoSecuencia).
export function filtrarPorEstadoSecuencia<T extends { estado?: EstadoSecuencia }>(
  items: T[],
  filtro: FiltroEstadoSecuencia,
): T[] {
  if (filtro === 'todas') return items;
  return items.filter((i) => infoEstadoSecuencia(i.estado).estado === filtro);
}
