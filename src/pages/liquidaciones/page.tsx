// Liquidaciones de viajes.
//
// No hay alta manual: el liquidador consume los viajes COMPLETADOS de guía de despacho. La pestaña
// "Viajes por liquidar" es la bandeja de entrada; "Historial" son las liquidaciones emitidas, con
// su estado y la cadena de re-liquidaciones (un viaje tiene UNA vigente).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import Badge from '../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import StatCard from '../../components/feature/StatCard';
import CountryScopeBar from '../../components/feature/CountryScopeBar';
import LiquidarViajeModal from './components/LiquidarViajeModal';
import DetalleLiquidacionModal from './components/DetalleLiquidacionModal';
import { useActiveCountry } from '../../hooks/useActiveCountry';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import { listSettlements, updateSettlementStatus } from '../../lib/tarifas/settlementsDataSource';
import { listLiquidableTrips } from '../../lib/tarifas/tripsDataSource';
import { formatMoney } from '../../lib/tarifas/format';
import type { SettlementRecord, SettlementStatus, TripRecord } from '../../lib/tarifas/types';

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

type Tab = 'trips' | 'history';

export default function LiquidacionesPage() {
  const { countries, country: activeCountry, countryId, loading: loadingCountries, setCountry } = useActiveCountry();
  const { canCreate, canEdit } = useModulePermissions('tarifas');

  const [tab, setTab] = useState<Tab>('trips');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');

  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [loadingSettlements, setLoadingSettlements] = useState(true);

  // Modal de liquidar: un viaje nuevo, o la liquidación vigente que se reemplaza.
  const [modal, setModal] = useState<{ trip: TripRecord | null; settlement: SettlementRecord | null } | null>(null);
  const [detalle, setDetalle] = useState<SettlementRecord | null>(null);

  const loadTrips = useCallback(async () => {
    if (!countryId) return;
    setLoadingTrips(true);
    try {
      setTrips(await listLiquidableTrips({
        countryId,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }));
    } catch (e) {
      setTrips([]);
      setError(e instanceof Error ? e.message : 'No se pudieron leer los viajes por liquidar.');
    } finally {
      setLoadingTrips(false);
    }
  }, [countryId, from, to]);

  const loadSettlements = useCallback(async () => {
    if (!countryId) return;
    setLoadingSettlements(true);
    try {
      setSettlements(await listSettlements({
        countryId,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }));
    } catch (e) {
      setSettlements([]);
      setError(e instanceof Error ? e.message : 'No se pudo leer el historial de liquidaciones.');
    } finally {
      setLoadingSettlements(false);
    }
  }, [countryId, from, to]);

  useEffect(() => { setError(''); void loadTrips(); void loadSettlements(); }, [loadTrips, loadSettlements]);

  const reload = () => { void loadTrips(); void loadSettlements(); };

  const moneda = activeCountry?.local_currency ?? '';
  const numeroDe = useMemo(
    () => new Map(settlements.map((s) => [s.id, s.number])),
    [settlements],
  );

  const kpis = useMemo(() => {
    const vigentes = settlements.filter((s) => s.status !== 'Anulado');
    const total = vigentes.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const pendiente = vigentes
      .filter((s) => s.status === 'Borrador' || s.status === 'En Revisión')
      .reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const enPerdida = vigentes.filter((s) => s.marginStatus === 'LOSS').length;
    return { total, pendiente, enPerdida };
  }, [settlements]);

  const cambiarEstado = async (s: SettlementRecord, status: SettlementStatus) => {
    setError('');
    const { error: err } = await updateSettlementStatus(s.id, status);
    if (err) setError(err);
    await loadSettlements();
    if (!err && status === 'Anulado') void loadTrips();
  };

  const tripColumns: DataTableColumn<TripRecord>[] = [
    {
      key: 'routeNumber', header: 'Viaje', sortable: true,
      accessor: (t) => t.routeNumber,
      render: (t) => <span className="font-mono text-xs text-teal-700">{t.routeNumber}</span>,
    },
    { key: 'routeDate', header: 'Fecha', sortable: true, accessor: (t) => t.routeDate },
    {
      key: 'carrier', header: 'Transportista', sortable: true, filterable: true,
      accessor: (t) => t.carrierName ?? '',
    },
    {
      key: 'fleet', header: 'Flota', filterable: true,
      accessor: (t) => (t.isOwnFleet ? 'Propia' : 'Externa'),
    },
    { key: 'driver', header: 'Conductor', sortable: true, filterable: true, accessor: (t) => t.driverName ?? '' },
    {
      key: 'vehicle', header: 'Vehículo', sortable: true,
      accessor: (t) => t.vehiclePlate ?? '',
      render: (t) => `${t.vehiclePlate ?? '—'} · ${t.vehicleType ?? '—'}`,
    },
    {
      key: 'zone', header: 'Zona destino', sortable: true, filterable: true,
      accessor: (t) => t.destZoneCode ?? '',
      render: (t) => (t.destZoneCode ? `${t.destZoneCode} · ${t.destZoneName ?? ''}` : '—'),
    },
    { key: 'km', header: 'Km', sortable: true, align: 'right', accessor: (t) => t.km },
    {
      key: 'stops', header: 'Paradas', sortable: true, align: 'right',
      accessor: (t) => t.completedStops,
      render: (t) => `${t.completedStops} / ${t.totalStops}`,
    },
    { key: 'weight', header: 'Peso (kg)', sortable: true, align: 'right', accessor: (t) => t.weightKg },
  ];

  const settlementColumns: DataTableColumn<SettlementRecord>[] = [
    {
      key: 'number', header: 'Nro', sortable: true,
      accessor: (s) => s.number,
      render: (s) => (
        <div>
          <span className="font-mono text-xs text-teal-700">{s.number}</span>
          {s.supersededBy && (
            <div className="text-[11px] text-slate-400">
              reemplazada por {numeroDe.get(s.supersededBy) ?? s.supersededBy}
            </div>
          )}
        </div>
      ),
    },
    { key: 'trip', header: 'Viaje', sortable: true, accessor: (s) => s.tripNumber },
    { key: 'date', header: 'Fecha', sortable: true, accessor: (s) => s.settlementDate },
    {
      key: 'carrier', header: 'Transportista', sortable: true, filterable: true,
      accessor: (s) => s.tripInfo.carrierName ?? '',
    },
    {
      key: 'total', header: 'Total', sortable: true, align: 'right',
      accessor: (s) => Number(s.totalAmount),
      render: (s) => <span className="font-medium text-slate-900">{formatMoney(s.totalAmount, s.currency)}</span>,
    },
    {
      key: 'margin', header: 'Margen', filterable: true,
      accessor: (s) => (s.marginStatus ? MARGIN_LABEL[s.marginStatus] ?? s.marginStatus : ''),
      render: (s) => (s.marginStatus ? (
        <Badge variant={MARGIN_BADGE[s.marginStatus] ?? 'default'} size="sm">
          {MARGIN_LABEL[s.marginStatus] ?? s.marginStatus}
        </Badge>
      ) : <span className="text-slate-300">—</span>),
    },
    {
      key: 'status', header: 'Estado', sortable: true, filterable: true,
      accessor: (s) => s.status,
      render: (s) => (
        <select
          value={s.status}
          onChange={(e) => void cambiarEstado(s, e.target.value as SettlementStatus)}
          disabled={!canEdit || !!s.supersededBy}
          title={s.supersededBy ? 'Reemplazada al re-liquidar: no se puede reactivar' : undefined}
          className={`text-xs rounded-full px-2.5 py-1 border-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${STATUS_CLASSES[s.status] ?? ''}`}
        >
          {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      ),
    },
  ];

  if (loadingCountries) {
    return <div className="p-6 text-center text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl"></i></div>;
  }

  const tabClass = (t: Tab) => `px-4 py-2 text-sm font-medium border-b-2 cursor-pointer ${
    tab === t ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Liquidaciones</h1>
        <p className="text-sm text-slate-500 mt-1">
          Cuánto se le paga a cada transportista por cada viaje completado, y por qué.
        </p>
      </div>

      <CountryScopeBar countries={countries} country={activeCountry} onChange={setCountry} />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Viajes por liquidar" value={String(trips.length)} icon="ri-route-line" color="teal" />
        <StatCard title="Total liquidado" value={formatMoney(kpis.total.toFixed(2), moneda)} icon="ri-money-dollar-circle-line" color="emerald" />
        <StatCard title="Sin aprobar" value={formatMoney(kpis.pendiente.toFixed(2), moneda)} icon="ri-time-line" color="amber" />
        <StatCard title="En pérdida" value={String(kpis.enPerdida)} icon="ri-alert-line" color="red" />
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div className="flex border-b border-slate-200">
            <button type="button" className={tabClass('trips')} onClick={() => setTab('trips')}>
              Viajes por liquidar
            </button>
            <button type="button" className={tabClass('history')} onClick={() => setTab('history')}>
              Historial
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="Hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {tab === 'trips' ? (
          <DataTable
            data={trips}
            columns={tripColumns}
            getRowId={(t) => t.id}
            loading={loadingTrips}
            searchPlaceholder="Buscar por viaje, transportista, conductor o placa"
            exportFileName="viajes_por_liquidar"
            emptyMessage="No hay viajes completados pendientes de liquidar"
            pageSize={25}
            actions={(t) => (canCreate ? (
              <Button size="sm" onClick={() => setModal({ trip: t, settlement: null })} title="Liquidar este viaje">
                <i className="ri-calculator-line mr-1"></i>Liquidar
              </Button>
            ) : null)}
          />
        ) : (
          <DataTable
            data={settlements}
            columns={settlementColumns}
            getRowId={(s) => s.id}
            loading={loadingSettlements}
            searchPlaceholder="Buscar por LIQ-, viaje o transportista"
            exportFileName="liquidaciones_historial"
            emptyMessage="No hay liquidaciones emitidas"
            pageSize={25}
            actions={(s) => (
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => setDetalle(s)} title="Ver el desglose">
                  <i className="ri-eye-line"></i>
                </Button>
                {canEdit && !s.supersededBy && s.status !== 'Anulado' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModal({ trip: null, settlement: s })}
                    title="Re-liquidar el viaje"
                  >
                    <i className="ri-refresh-line"></i>
                  </Button>
                )}
              </div>
            )}
          />
        )}
      </Card>

      <LiquidarViajeModal
        isOpen={!!modal}
        trip={modal?.trip ?? null}
        settlement={modal?.settlement ?? null}
        onClose={() => setModal(null)}
        onSaved={reload}
      />

      <DetalleLiquidacionModal
        settlement={detalle}
        onClose={() => setDetalle(null)}
      />
    </div>
  );
}
