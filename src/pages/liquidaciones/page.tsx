// Liquidaciones emitidas.
//
// Lee del almacén del módulo, no del TMS. Antes la lista salía de una tabla compartida que no tiene
// columnas para el desglose, así que una liquidación emitida quedaba reducida a un total: no se
// podía volver a explicar de dónde salió.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import Badge from '../../components/base/Badge';
import StatCard from '../../components/feature/StatCard';
import CountryScopeBar from '../../components/feature/CountryScopeBar';
import LiquidacionModal from './components/LiquidacionModal';
import DetalleLiquidacionModal from './components/DetalleLiquidacionModal';
import { useActiveCountry } from '../../hooks/useActiveCountry';
import { listSettlements, updateSettlementStatus } from '../../lib/tarifas/settlementsDataSource';
import { loadParties } from '../../lib/tarifas/catalogLoader';
import { formatMoney } from '../../lib/tarifas/format';
import { registrarEvento } from '../../lib/liquidador/auditLog';
import { obtenerRolActivo } from '../../lib/liquidador/rbac';
import type { SettlementRecord, SettlementStatus } from '../../lib/tarifas/types';

const MARGIN_BADGE: Record<string, 'success' | 'warning' | 'danger'> = {
  OK: 'success', WARN: 'warning', CRITICAL: 'danger', LOSS: 'danger',
};
const MARGIN_LABEL: Record<string, string> = {
  OK: 'OK', WARN: 'Atención', CRITICAL: 'Crítico', LOSS: 'Pérdida',
};

const ESTADOS: SettlementStatus[] = ['Borrador', 'En Revisión', 'Aprobado', 'Pagado', 'Anulado'];

const STATUS_CLASSES: Record<string, string> = {
  'Borrador': 'bg-slate-100 text-slate-700',
  'En Revisión': 'bg-amber-100 text-amber-700',
  'Aprobado': 'bg-emerald-100 text-emerald-700',
  'Pagado': 'bg-teal-100 text-teal-700',
  'Anulado': 'bg-red-100 text-red-700',
};

export default function LiquidacionesPage() {
  const { countries, country: activeCountry, countryId, loading: loadingCountries, setCountry } = useActiveCountry();

  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detalle, setDetalle] = useState<SettlementRecord | null>(null);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const parties = useMemo(
    () => loadParties().filter((p) => p.countryId === countryId),
    [countryId],
  );
  const partyName = (id: string) => parties.find((p) => p.id === id)?.name ?? id;

  const load = useCallback(async () => {
    if (!countryId) return;
    setLoading(true);
    try {
      setSettlements(await listSettlements({
        countryId,
        ...(statusFilter ? { status: statusFilter as SettlementStatus } : {}),
        ...(partyFilter ? { partyId: partyFilter } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }));
    } finally {
      setLoading(false);
    }
  }, [countryId, statusFilter, partyFilter, from, to]);

  useEffect(() => { void load(); }, [load]);

  // El buscador va sobre lo que la gente tiene a mano: el nro de viaje de la guía o el de la
  // liquidación.
  const visibles = settlements.filter((s) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return s.number.toLowerCase().includes(q)
      || (s.tripNumber ?? '').toLowerCase().includes(q)
      || partyName(s.partyId).toLowerCase().includes(q);
  });

  const moneda = activeCountry?.local_currency ?? '';

  const kpis = useMemo(() => {
    const total = visibles.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const pendiente = visibles
      .filter((s) => s.status === 'Borrador' || s.status === 'En Revisión')
      .reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const enPerdida = visibles.filter((s) => s.marginStatus === 'LOSS').length;
    return { total, pendiente, enPerdida, cantidad: visibles.length };
  }, [visibles]);

  const cambiarEstado = async (s: SettlementRecord, status: SettlementStatus) => {
    setError('');
    const { error: err } = await updateSettlementStatus(s.id, status);
    if (err) { setError(err); return; }

    await registrarEvento({
      entidad: 'settlement',
      entidadId: s.id,
      accion: status === 'Aprobado' || status === 'Pagado' ? 'AUTHORIZE' : 'UPDATE',
      usuario: 'Usuario simulado',
      rol: obtenerRolActivo(),
      antes: { estado: s.status },
      despues: { estado: status },
      motivo: s.marginReason ?? undefined,
    });
    await load();
  };

  if (loadingCountries) {
    return <div className="p-6 text-center text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl"></i></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Liquidaciones</h1>
          <p className="text-sm text-slate-500 mt-1">
            Cuánto se le paga a cada transportista por cada viaje, y por qué.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} disabled={!countryId}>
          <i className="ri-add-line mr-1"></i>Nueva liquidación
        </Button>
      </div>

      <CountryScopeBar countries={countries} country={activeCountry} onChange={setCountry} />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Liquidaciones" value={String(kpis.cantidad)} icon="ri-file-list-3-line" color="teal" />
        <StatCard title="Total" value={formatMoney(kpis.total.toFixed(2), moneda)} icon="ri-money-dollar-circle-line" color="emerald" />
        <StatCard title="Sin aprobar" value={formatMoney(kpis.pendiente.toFixed(2), moneda)} icon="ri-time-line" color="amber" />
        <StatCard title="En pérdida" value={String(kpis.enPerdida)} icon="ri-alert-line" color="red" />
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <Input
            label="Buscar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nro de viaje, LIQ- o transportista"
            icon="ri-search-line"
          />
          <Select
            label="Estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[{ value: '', label: 'Todos' }, ...ESTADOS.map((s) => ({ value: s, label: s }))]}
          />
          <Select
            label="Transportista"
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            options={[{ value: '', label: 'Todos' }, ...parties.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <Input label="Desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        {loading ? (
          <div className="text-center py-14 text-slate-400"><i className="ri-loader-4-line animate-spin text-2xl"></i></div>
        ) : visibles.length === 0 ? (
          <div className="text-center py-14">
            <div className="w-16 h-16 flex items-center justify-center bg-slate-100 rounded-full mx-auto mb-4">
              <i className="ri-file-list-3-line text-2xl text-slate-400"></i>
            </div>
            <h3 className="text-lg font-medium text-slate-700 mb-1">No hay liquidaciones</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Para emitir una hacen falta rutas y conductores cargados en la ficha del transportista.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500 uppercase">
                  <th className="py-3 px-3">Nro</th>
                  <th className="py-3 px-3">Viaje</th>
                  <th className="py-3 px-3">Transportista</th>
                  <th className="py-3 px-3">Fecha</th>
                  <th className="py-3 px-3 text-right">Total</th>
                  <th className="py-3 px-3">Margen</th>
                  <th className="py-3 px-3">Estado</th>
                  <th className="py-3 px-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibles.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono text-xs text-teal-700">{s.number}</td>
                    <td className="py-2.5 px-3 text-slate-800">{s.tripNumber ?? '—'}</td>
                    <td className="py-2.5 px-3 text-slate-700">{partyName(s.partyId)}</td>
                    <td className="py-2.5 px-3 text-slate-600">{s.settlementDate}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-900">
                      {formatMoney(s.totalAmount, s.currency)}
                    </td>
                    <td className="py-2.5 px-3">
                      {s.marginStatus ? (
                        <Badge variant={MARGIN_BADGE[s.marginStatus] ?? 'default'} size="sm">
                          {MARGIN_LABEL[s.marginStatus] ?? s.marginStatus}
                        </Badge>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={s.status}
                        onChange={(e) => void cambiarEstado(s, e.target.value as SettlementStatus)}
                        className={`text-xs rounded-full px-2.5 py-1 border-0 cursor-pointer ${STATUS_CLASSES[s.status] ?? ''}`}
                      >
                        {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setDetalle(s)} title="Ver el desglose">
                          <i className="ri-eye-line"></i>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <LiquidacionModal
        isOpen={isModalOpen}
        countryId={countryId}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => void load()}
      />

      <DetalleLiquidacionModal
        settlement={detalle}
        onClose={() => setDetalle(null)}
      />
    </div>
  );
}
