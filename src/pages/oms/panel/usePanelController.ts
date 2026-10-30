import { useCallback, useEffect, useState } from 'react';
import { omsApi } from '../api/omsApi';
import { fetchBandeja } from '../bandeja/bandeja-api';
import type { OmsMotorActividad, OmsPipeline, ProximaLiberacion } from '../types';

// Controller del Panel del OMS. Dashboard del MOTOR (ADR-013) con datos REALES:
//  - embudo del día + "por liberar pronto" desde public.orders;
//  - latido del motor (corridas + errores) desde oms_logs.
// "En cola" = cantidad de pedidos en la BANDEJA (pedidos crudos aún sin priorizar,
// los que salen a más de 3 días): se toma del MISMO endpoint que alimenta la vista
// Bandeja (/v1/planificacion/bandeja) para que el número coincida 1:1 con ella.
// Ya no hay alertas/distribución/overdue mock. Un solo load; expone recargar().
export function usePanelController() {
  const [pipeline, setPipeline] = useState<OmsPipeline | null>(null);
  const [proximas, setProximas] = useState<ProximaLiberacion[]>([]);
  const [actividad, setActividad] = useState<OmsMotorActividad | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // La bandeja vive en el backend de Planificación: si falla, no tumba el panel —
    // se deja el enCola que ya calculó getPanelResumen (fallback = null).
    Promise.all([omsApi.getPanelResumen(), omsApi.getMotorActividad(), fetchBandeja().catch(() => null)])
      .then(([resumen, act, bandeja]) => {
        if (cancelled) return;
        setPipeline(bandeja == null ? resumen.pipeline : { ...resumen.pipeline, enCola: bandeja.length });
        setProximas(resumen.proximas);
        setActividad(act);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos del motor.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => cargar(), [cargar]);

  return { pipeline, proximas, actividad, loading, error, recargar: cargar };
}
