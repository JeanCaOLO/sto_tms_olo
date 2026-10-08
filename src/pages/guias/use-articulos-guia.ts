import { useEffect, useState } from 'react';
import type { Articulo } from '../planificacion/types';
import { fetchArticulosDePedido } from '../planificacion/plan-pedidos-api';

// Precarga los artículos de TODAS las paradas de una guía en paralelo, al abrir
// el detalle. Es necesario para el impreso: window.print() solo imprime lo que
// está en el DOM, así que no se puede cargar artículo por artículo al hacer clic.
// Mientras carga, el botón Imprimir queda deshabilitado (no imprimir a medias).
// ponytail: fetchArticulosDePedido ya atrapa errores y devuelve []; no
// distinguimos "falló" de "vacío" (ambos = "Sin artículos"). Si se necesita
// reintento por parada, hacer que la API señale el fallo.
export function useArticulosGuia(orderIds: string[]) {
  const [porPedido, setPorPedido] = useState<Map<string, Articulo[]>>(new Map());
  const [cargando, setCargando] = useState(true);
  const clave = orderIds.join(',');

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setPorPedido(new Map());
    Promise.all(orderIds.map(async (id) => [id, await fetchArticulosDePedido(id)] as const)).then(
      (pares) => {
        if (!vivo) return;
        setPorPedido(new Map(pares));
        setCargando(false);
      },
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return { porPedido, cargando };
}
