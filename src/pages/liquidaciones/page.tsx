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
import DataModeBanner from '../../components/tarifas/DataModeBanner';
import LiquidarViajeModal from './components/LiquidarViajeModal';
import DetalleLiquidacionModal from './components/DetalleLiquidacionModal';
import TripOrdersPanel from './components/TripOrdersPanel';
import { InterruptorVista, useVistaLiquidador } from './components/useVistaLiquidador';
import { useActiveCountry } from '../../hooks/useActiveCountry';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import { useTarifasActor } from '../../hooks/useTarifasActor';
import { getSettlement, listSettlementSummaries, updateSettlementStatus } from '../../lib/tarifas/settlementsDataSource';
import { listPendingTrips } from '../../lib/tarifas/tripsDataSource';
import { notLiquidableReason } from '../../lib/tarifas/tripContext';
import { deliveryLabel, MARK_LABELS, tripProgress } from '../../lib/tarifas/tripOrders';
import { formatMoney } from '../../lib/tarifas/format';
import type { SettlementOrder, SettlementRecord, SettlementStatus, TripRecord } from '../../lib/tarifas/types';

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
/** Qué viajes pendientes se ven: los listos, los que tienen algo sin completar (auditoría) o todos. */
type Alcance = 'ready' | 'incomplete' | 'all';

const ALCANCES: { value: Alcance; label: string; hint: string }[] = [
  { value: 'ready', label: 'Listos para liquidar', hint: 'Completados y con todos sus pedidos entregados' },
  { value: 'incomplete', label: 'Incompletos (auditoría)', hint: 'No completados o con pedidos sin entregar' },
  { value: 'all', label: 'Todos', hint: 'Todos los viajes sin liquidación vigente' },
];

/** Pedidos de una liquidación emitida: lo que se midió y qué pasó con cada uno. */
function PedidosEmitidos({ orders, currency }: { orders: SettlementOrder[] | null; currency: string }) {
  if (!orders || orders.length === 0) {
    return <p className="text-xs text-slate-400">Esta liquidación no guardó pedidos (el viaje no los tenía cargados).</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-1 pr-3 font-medium">Guía</th>
          <th className="py-1 pr-3 font-medium">Pedido</th>
          <th className="py-1 pr-3 font-medium">Casa comercial</th>
          <th className="py-1 pr-3 font-medium text-right">Valor</th>
          <th className="py-1 pr-3 font-medium">Entrega</th>
          <th className="py-1 pr-3 font-medium">En la liquidación</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o, i) => (
          <tr key={`${o.orderId ?? 'x'}-${i}`} className="border-t border-slate-100">
            <td className="py-1 pr-3 font-mono">{o.guideNumber ?? '—'}</td>
            <td className="py-1 pr-3 font-mono">{o.orderNumber ?? '—'}</td>
            <td className="py-1 pr-3">{o.customerName ?? '—'}</td>
            <td className="py-1 pr-3 text-right">{Number(o.value) > 0 ? formatMoney(o.value, currency) : '—'}</td>
            <td className="py-1 pr-3">{deliveryLabel(o.deliveryStatus)}</td>
            <td className="py-1 pr-3">
              {MARK_LABELS[o.status]}
              {o.reason && <span className="text-slate-400"> · {o.reason}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function LiquidacionesPage() {
  const { country: activeCountry, countryId, problem, selectedName, loading: loadingCountries } = useActiveCountry();
  const { canCreate, canEdit } = useModulePermissions('tarifas');
  useTarifasActor();
  const { extendida, puedeConfigurar, setExtendida } = useVistaLiquidador();

  const [tab, setTab] = useState<Tab>('trips');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');

  const [alcance, setAlcance] = useState<Alcance>('ready');
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
      // Una sola lectura; los alcances se separan en memoria.
      setTrips(await listPendingTrips('all', {
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

  // La tabla trae las liquidaciones sin el cálculo (trace, reglas, avisos…); el desglose y re-liquidar
  // necesitan la liquidación entera, que se lee al abrir (y así siempre está al día).
  const abrirCompleta = useCallback(async (s: SettlementRecord, abrir: (full: SettlementRecord) => void) => {
    try {
      abrir((await getSettlement(s.id)) ?? s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la liquidación.');
    }
  }, []);

  const loadSettlements = useCallback(async () => {
    if (!countryId) return;
    setLoadingSettlements(true);
    try {
      setSettlements(await listSettlementSummaries({
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

  const listos = useMemo(() => trips.filter((t) => t.status === 'completed' && tripProgress(t).complete), [trips]);
  const incompletos = useMemo(() => trips.filter((t) => !tripProgress(t).complete), [trips]);
  const visibles = alcance === 'ready' ? listos : alcance === 'incomplete' ? incompletos : trips;

  const kpis = useMemo(() => {
    const vigentes = settlements.filter((s) => s.status !== 'Anulado');
    const total = vigentes.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const pendiente = vigentes
      .filter((s) => s.status === 'Borrador' || s.status === 'En Revisión')
      .reduce((sum, s) => sum + Number(s.totalAmount), 0);
    return { total, pendiente };
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
      key: 'progress', header: 'Avance', sortable: true, filterable: true,
      accessor: (t) => tripProgress(t).label,
      render: (t) => {
        const p = tripProgress(t);
        return <Badge variant={p.complete ? 'success' : 'warning'} size="sm">{p.label}</Badge>;
      },
    },
    {
      key: 'carrier', header: 'Transportista', sortable: true, filterable: true,
      accessor: (t) => t.carrierName ?? '', cellClassName: 'max-w-[160px] truncate',
      render: (t) => <span title={t.carrierName ?? ''}>{t.carrierName ?? '—'}</span>,
    },
    {
      key: 'fleet', header: 'Flota', filterable: true,
      accessor: (t) => (t.isOwnFleet ? 'Propia' : 'Externa'),
    },
    {
      key: 'driver', header: 'Conductor', sortable: true, filterable: true, accessor: (t) => t.driverName ?? '',
      cellClassName: 'max-w-[160px] truncate',
      render: (t) => <span title={t.driverName ?? ''}>{t.driverName ?? '—'}</span>,
    },
    {
      key: 'vehicle', header: 'Vehículo', sortable: true,
      accessor: (t) => `${t.vehiclePlate ?? ''} ${t.vehicleType ?? ''}`.trim(), cellClassName: 'max-w-[150px] truncate',
      render: (t) => { const v = `${t.vehiclePlate ?? '—'} · ${t.vehicleType ?? '—'}`; return <span title={v}>{v}</span>; },
    },
    {
      key: 'zone', header: 'Zona destino', sortable: true, filterable: true,
      accessor: (t) => (t.destZoneCode ? `${t.destZoneCode} · ${t.destZoneName ?? ''}` : ''), cellClassName: 'max-w-[160px] truncate',
      render: (t) => { const z = t.destZoneCode ? `${t.destZoneCode} · ${t.destZoneName ?? ''}` : '—'; return <span title={z}>{z}</span>; },
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
      key: 'orders', header: 'Pedidos', sortable: true,
      accessor: (s) => (s.orders ? s.orders.filter((o) => o.status !== 'ANULADO').length : 0),
      render: (s) => {
        if (!s.orders) return <span className="text-slate-300">—</span>;
        const diferidos = s.orders.filter((o) => o.status === 'DIFERIDO').length;
        const anulados = s.orders.filter((o) => o.status === 'ANULADO').length;
        return (
          <div className="text-xs">
            <span>{s.orders.length - anulados} en el reparto</span>
            {diferidos > 0 && <Badge variant="warning" size="sm" className="ml-1">{diferidos} para después</Badge>}
            {anulados > 0 && <Badge variant="danger" size="sm" className="ml-1">{anulados} anulados</Badge>}
          </div>
        );
      },
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

  // Ganancia/pérdida: solo auditoría, solo en la vista extendida. Nunca bloquea nada.
  const columnasHistorial: DataTableColumn<SettlementRecord>[] = extendida
    ? [
      ...settlementColumns.slice(0, 5),
      {
        key: 'margin', header: 'Ganancia (auditoría)', filterable: true,
        accessor: (s) => (s.cargoValue && s.marginStatus ? MARGIN_LABEL[s.marginStatus] ?? s.marginStatus : ''),
        exportValue: (s) => (s.cargoValue && s.marginAmount ? Number(s.marginAmount) : ''),
        render: (s) => (s.cargoValue && s.marginStatus ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-700">{formatMoney(s.marginAmount ?? '0', s.currency)}</span>
            <Badge variant={MARGIN_BADGE[s.marginStatus] ?? 'default'} size="sm">
              {MARGIN_LABEL[s.marginStatus] ?? s.marginStatus}
            </Badge>
          </div>
        ) : <span className="text-slate-300">—</span>),
      },
      ...settlementColumns.slice(5),
    ]
    : settlementColumns;

  if (loadingCountries) {
    return <div className="p-6 text-center text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl"></i></div>;
  }

  const tabClass = (t: Tab) => `px-4 py-2 text-sm font-medium border-b-2 cursor-pointer ${
    tab === t ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Liquidaciones</h1>
          <p className="text-sm text-slate-500 mt-1">
            Cuánto se le paga a cada transportista por cada viaje completado, y por qué.
          </p>
        </div>
        {puedeConfigurar && <InterruptorVista extendida={extendida} onChange={setExtendida} />}
      </div>

      <DataModeBanner />
      <CountryScopeBar country={activeCountry} problem={problem} selectedName={selectedName} loading={loadingCountries} />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Listos para liquidar" value={String(listos.length)} icon="ri-route-line" color="teal" />
        <StatCard title="Incompletos" value={String(incompletos.length)} icon="ri-error-warning-line" color="amber" />
        <StatCard title="Total liquidado" value={formatMoney(kpis.total.toFixed(2), moneda)} icon="ri-money-dollar-circle-line" color="emerald" />
        <StatCard title="Sin aprobar" value={formatMoney(kpis.pendiente.toFixed(2), moneda)} icon="ri-time-line" color="amber" />
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

        {tab === 'trips' && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {ALCANCES.map((a) => (
              <button
                key={a.value}
                type="button"
                title={a.hint}
                onClick={() => setAlcance(a.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border cursor-pointer transition-colors ${
                  alcance === a.value
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'}`}
              >
                {a.label}
                <span className="ml-1.5 opacity-80">
                  {a.value === 'ready' ? listos.length : a.value === 'incomplete' ? incompletos.length : trips.length}
                </span>
              </button>
            ))}
          </div>
        )}

        {tab === 'trips' ? (
          <DataTable
            data={visibles}
            columns={tripColumns}
            getRowId={(t) => t.id}
            loading={loadingTrips}
            columnsKey={`liquidaciones.viajes.${extendida ? 'extendida' : 'simple'}`}
            defaultHidden={extendida ? [] : ['fleet', 'driver', 'vehicle', 'weight', 'zone']}
            renderExpanded={(t) => (
              <TripOrdersPanel
                trip={t}
                currency={moneda}
                intro="Pedidos que lleva el viaje, uno por guía de despacho. Se liquidan juntos; desde Liquidar se puede anular alguno o dejarlo para después."
              />
            )}
            searchPlaceholder="Buscar por viaje, transportista, conductor o placa"
            exportFileName="viajes_por_liquidar"
            emptyMessage="No hay viajes completados pendientes de liquidar"
            pageSize={25}
            actions={(t) => {
              if (!canCreate) return null;
              const motivo = notLiquidableReason(t);
              const parcial = !tripProgress(t).complete;
              return (
                <Button
                  size="sm"
                  variant={parcial ? 'secondary' : 'primary'}
                  disabled={!!motivo}
                  onClick={() => setModal({ trip: t, settlement: null })}
                  title={motivo ?? (parcial ? 'Tiene pedidos sin entregar: podés anularlos o dejarlos para después' : 'Liquidar este viaje')}
                >
                  <i className="ri-calculator-line mr-1"></i>Liquidar
                </Button>
              );
            }}
          />
        ) : (
          <DataTable
            data={settlements}
            columns={columnasHistorial}
            getRowId={(s) => s.id}
            loading={loadingSettlements}
            columnsKey={`liquidaciones.historial.${extendida ? 'extendida' : 'simple'}`}
            renderExpanded={(s) => <PedidosEmitidos orders={s.orders} currency={s.currency} />}
            searchPlaceholder="Buscar por LIQ-, viaje o transportista"
            exportFileName="liquidaciones_historial"
            emptyMessage="No hay liquidaciones emitidas"
            pageSize={25}
            actions={(s) => (
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => void abrirCompleta(s, setDetalle)} title="Ver el desglose">
                  <i className="ri-eye-line"></i>
                </Button>
                {canEdit && !s.supersededBy && s.status !== 'Anulado' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void abrirCompleta(s, (full) => setModal({ trip: null, settlement: full }))}
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
