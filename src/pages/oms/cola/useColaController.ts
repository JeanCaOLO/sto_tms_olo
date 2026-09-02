import { useEffect, useState } from 'react';
import { omsApi } from '../api/omsApi';
import type { Country, PriorityTier, QueueOrder } from '../types';

// Controller de la Cola de Priorización (FR2/FR3). Maneja selección de pedido
// y el override manual local (única intervención humana; sin backend).
export function useColaController() {
  const [country, setCountry] = useState<Country>('CR');
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedId(null);
    omsApi.getQueue(country)
      .then((rows) => { if (!cancelled) setOrders(rows); })
      .catch(() => { if (!cancelled) setError('No se pudo cargar la cola.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country]);

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  const scoreForTier: Record<PriorityTier, number> = { critico: 950, alto: 650, medio: 350, bajo: 50 };

  // Override manual local (FR3.4/FR3.5): recalcula score, reordena y registra
  // en el historial del pedido. Mock: no persiste fuera de la sesión.
  const applyOverride = (tier: PriorityTier, reason: string) => {
    if (!selected) return;
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    setOrders((prev) =>
      prev
        .map((o) =>
          o.id === selected.id
            ? {
                ...o,
                tier,
                score: scoreForTier[tier],
                history: [...o.history, { at: now, from: o.tier, to: tier, type: 'manual' as const, reason }],
              }
            : o,
        )
        .sort((a, b) => b.score - a.score),
    );
    setOverrideOpen(false);
  };

  return {
    country, setCountry, orders, loading, error,
    selectedId, setSelectedId, selected,
    overrideOpen, setOverrideOpen, applyOverride,
  };
}
