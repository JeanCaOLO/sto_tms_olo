import { useState } from 'react';
import type { AppUser } from '../../lib/mock-auth';
import { generarRutaEnDb } from './generar-ruta-api';
import type { PedidoSeleccionado, RutaTipo, Vehiculo } from './types';

interface UseGenerarRutaArgs {
  appUser: AppUser | null;
  vehiculos: Vehiculo[];
  rutas: RutaTipo[];
}

interface GenerarRutaInput {
  pedidosSeleccionados: PedidoSeleccionado[];
  rutaTypeId: string;
  conductorId: string;
  vehiculoId: string;
  fechaRuta: string;
}

export function useGenerarRuta({ appUser, vehiculos, rutas }: UseGenerarRutaArgs) {
  const [generando, setGenerando] = useState(false);

  const generarRuta = async (input: GenerarRutaInput, onSuccess: () => void) => {
    const { pedidosSeleccionados, rutaTypeId, conductorId, vehiculoId } = input;
    if (!conductorId || !vehiculoId || !rutaTypeId || pedidosSeleccionados.length === 0 || !appUser) {
      alert('Por favor completa todos los campos y asegúrate de tener pedidos en la ruta');
      return;
    }
    const vehiculo = vehiculos.find((v) => v.id === vehiculoId);
    if (!vehiculo) {
      alert('Vehículo no encontrado');
      return;
    }
    try {
      setGenerando(true);
      const { routeNumber } = await generarRutaEnDb({ appUser, vehiculo, ...input });
      const rutaNombre = rutas.find((r) => r.id === rutaTypeId)?.name || '';
      alert(`¡Ruta ${routeNumber} (${rutaNombre}) generada exitosamente con ${pedidosSeleccionados.length} paradas!`);
      onSuccess();
    } catch (error) {
      console.error('Error al generar ruta:', error);
      alert('Error al generar la ruta. Por favor intenta nuevamente.');
    } finally {
      setGenerando(false);
    }
  };

  return { generarRuta, generando };
}
