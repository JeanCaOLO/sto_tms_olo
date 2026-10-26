import { useCallback, useEffect, useState } from 'react';
import { omsApi } from '../api/omsApi';
import type { OmsMotorActividad, OmsPipeline, ProximaLiberacion } from '../types';

// Controller del Panel del OMS. Dashboard del MOTOR (ADR-013) con datos REALES:
//  - embudo del día + "por liberar pronto" desde public.orders;
//  - latido del motor (corridas + errores) desde oms_logs.
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
    Promise.all([omsApi.getPanelResumen(), omsApi.getMotorActividad()])
      .then(([resumen, act]) => {
        if (cancelled) return;
        setPipeline(resumen.pipeline);
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
