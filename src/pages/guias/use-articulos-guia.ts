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
// ponytail: N peticiones concurrentes (una por parada) sin límite. OK para
// viajes de pocas paradas; si uno real pasa de ~20, agregar un endpoint batch
// de artículos o un límite de concurrencia.
export function useArticulosGuia(orderIds: string[]) {
  const [porPedido, setPorPedido] = useState<Map<string, Articulo[]>>(new Map());
  const [cargando, setCargando] = useState(true);
  const clave = JSON.stringify(orderIds); // estable y sin colisión por comas en ids

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
