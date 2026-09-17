import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

// Tabs de Planificación como sub-rutas (/planificacion/<tab>), para que el
// sidebar tenga submenús (estilo OMS) y cada tab sea enlazable/marcable.
export const PLAN_TABS = ['nueva', 'asignar', 'flota', 'generadas', 'matriz', 'maestros'] as const;
export type PlanTab = (typeof PLAN_TABS)[number];

// Deriva el tab activo de la URL y devuelve un setter que navega. Así el estado
// del tab vive en la ruta (una sola fuente de verdad) y no en useState.
export function useTabRoute(fallback: PlanTab): [PlanTab, (t: PlanTab) => void] {
  const navigate = useNavigate();
  const { tab } = useParams();
  const current = (PLAN_TABS as readonly string[]).includes(tab ?? '') ? (tab as PlanTab) : fallback;
  const setTab = useCallback((t: PlanTab) => navigate(`/planificacion/${t}`), [navigate]);
  return [current, setTab];
}
