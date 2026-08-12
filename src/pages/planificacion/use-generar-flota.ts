import { useState } from 'react';
import { useToast } from '../../hooks/useToast';
import { generarRutaMock } from './generar-ruta-mock';
import type { AsignacionFlota } from './fleet-split';

export function useGenerarFlota() {
  const [generando, setGenerando] = useState(false);
  const { showToast } = useToast();

  const generarFlota = (asignaciones: AsignacionFlota[], rutaTypeId: string, fechaRuta: string, onSuccess: () => void) => {
    if (asignaciones.length === 0) {
      showToast('No hay asignaciones para generar.', 'warning');
      return;
    }
    setGenerando(true);
    for (const asignacion of asignaciones) {
      generarRutaMock({
        rutaTypeId,
        transportistaId: '',
        conductorId: asignacion.slot.conductorId,
        vehiculoId: asignacion.slot.vehiculo.id,
        fechaRuta,
        pedidosSeleccionados: asignacion.pedidos,
      });
    }
    showToast(`${asignaciones.length} ruta(s) generada(s) para la flota.`, 'success');
    setGenerando(false);
    onSuccess();
  };

  return { generarFlota, generando };
}
