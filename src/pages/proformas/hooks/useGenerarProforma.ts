import { useCallback, useEffect, useMemo, useState } from 'react';
import { listSettlementSummaries } from '../../../lib/tarifas/settlements';
import {
  createProforma, groupByCarrier, groupedSettlementIds,
  type CarrierGroup, type GroupableSettlement, type ProformaRecord,
} from '../../../lib/tarifas/proformas';

/** Liquidaciones en Borrador del país, agrupadas por transportista, y la selección para armar una proforma. */
export function useGenerarProforma(countryId: string, onCreated: (proforma: ProformaRecord) => void) {
  const [groups, setGroups] = useState<CarrierGroup[]>([]);
  const [carrierId, setCarrierId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settlements, grouped] = await Promise.all([
          listSettlementSummaries({ countryId, includeVoided: false }),
          groupedSettlementIds(),
        ]);
        const items: GroupableSettlement[] = settlements.map((s) => ({
          id: s.id, carrierId: s.tripInfo.carrierId ?? null, carrierName: s.tripInfo.carrierName ?? null,
          totalAmount: Number(s.totalAmount), currency: s.currency, status: s.status,
        }));
        if (!cancelled) setGroups(groupByCarrier(items, grouped));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudieron cargar las liquidaciones.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [countryId]);

  const group = useMemo(() => groups.find((g) => g.carrierId === carrierId) ?? null, [groups, carrierId]);

  const pickCarrier = useCallback((id: string) => {
    setCarrierId(id);
    const next = groups.find((g) => g.carrierId === id);
    setSelected(new Set(next?.settlements.map((s) => s.id) ?? []));
  }, [groups]);

  const toggle = useCallback((id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const submit = useCallback(async () => {
    if (!group) return;
    setSaving(true);
    setError(null);
    const result = await createProforma({
      countryId, carrierId: group.carrierId, carrierName: group.carrierName, currency: group.currency,
      settlements: group.settlements.filter((s) => selected.has(s.id)),
    });
    setSaving(false);
    if (result.error) setError(result.error);
    else onCreated(result.proforma);
  }, [group, selected, countryId, onCreated]);

  return { groups, group, carrierId, selected, loading, saving, error, pickCarrier, toggle, submit };
}
