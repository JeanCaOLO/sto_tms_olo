import { useState } from 'react';
import { MOCK_AUTH_ENABLED, type AppUser } from '../../lib/mock-auth';
import { useToast } from '../../hooks/useToast';
import { generarRutaEnDb } from './generar-ruta-api';
import { generarRutaMock } from './generar-ruta-mock';
import type { PedidoSeleccionado, RutaTipo, Vehiculo } from './types';

interface UseGenerarRutaArgs {
  appUser: AppUser | null;
  vehiculos: Vehiculo[];
  rutas: RutaTipo[];
}

interface GenerarRutaInput {
  pedidosSeleccionados: PedidoSeleccionado[];
  rutaTypeId: string;
  transportistaId: string;
  conductorId: string;
  vehiculoId: string;
  fechaRuta: string;
}

export function useGenerarRuta({ appUser, vehiculos, rutas }: UseGenerarRutaArgs) {
  const [generando, setGenerando] = useState(false);
  const { showToast } = useToast();

  const generarRuta = async (input: GenerarRutaInput, onSuccess: () => void) => {
    const { pedidosSeleccionados, rutaTypeId, conductorId, vehiculoId } = input;
    if (!conductorId || !vehiculoId || !rutaTypeId || pedidosSeleccionados.length === 0 || !appUser) {
      showToast('Completa todos los campos y asegúrate de tener pedidos en la ruta.', 'warning');
      return;
    }
    const vehiculo = vehiculos.find((v) => v.id === vehiculoId);
    if (!vehiculo) {
      showToast('Vehículo no encontrado.', 'error');
      return;
    }
    try {
      setGenerando(true);
      const { routeNumber } = MOCK_AUTH_ENABLED
        ? generarRutaMock(input)
        : await generarRutaEnDb({ appUser, vehiculo, ...input });
      const rutaNombre = rutas.find((r) => r.id === rutaTypeId)?.name || '';
      showToast(`Ruta ${routeNumber} (${rutaNombre}) generada con ${pedidosSeleccionados.length} paradas.`, 'success');
      onSuccess();
    } catch (error) {
      console.error('Error al generar ruta:', error);
      showToast('Error al generar la ruta. Intenta nuevamente.', 'error');
    } finally {
      setGenerando(false);
    }
  };

  return { generarRuta, generando };
}
