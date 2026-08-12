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
