// Liquidaciones de viajes (settlements).
// El liquidador consume los viajes COMPLETADOS de guía de despacho.

import { useMemo, useState } from 'react';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import DataTable from '../../components/base/DataTable';
import StatCard from '../../components/feature/StatCard';
import CountryScopeBar from '../../components/feature/CountryScopeBar';
import LiquidarViajeModal from './components/LiquidarViajeModal';
import DetalleLiquidacionModal from './components/DetalleLiquidacionModal';
import TripOrdersPanel from './components/TripOrdersPanel';
import { InterruptorVista } from './components/InterruptorVista';
import { useActiveCountry } from '../../hooks/useActiveCountry';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import { useTarifasActor } from '../../hooks/useTarifasActor';
import { useLiquidacionesController } from './hooks/useLiquidacionesController';
import { useLiquidadorVista } from './hooks/useLiquidadorVista';
import { notLiquidableReason } from '../../lib/tarifas/tripContext';
import { tripProgress } from '../../lib/tarifas/tripOrders';
import { formatMoney } from '../../lib/tarifas/format';
import { tripColumns } from './parts/tripColumns';
import { getSettlementColumns, getSettlementColumnsExtended } from './parts/settlementColumns';
import { PedidosEmitidos } from './parts/PedidosEmitidos';
import { ALCANCES, getTabClass } from './parts/pageHelpers';
import type { SettlementRecord, TripRecord } from '../../lib/tarifas/types';

export default function LiquidacionesPage() {
  const { country: activeCountry, countryId, problem, selectedName, loading: loadingCountries } = useActiveCountry();
  const { canCreate, canEdit } = useModulePermissions('tarifas');
  useTarifasActor();
  const { extendida, puedeConfigurar, setExtendida } = useLiquidadorVista();

  const {
    tab, setTab, from, setFrom, to, setTo, error, trips, loadingTrips, settlements,
    loadingSettlements, reload, changeStatus, listos, incompletos, kpis,
  } = useLiquidacionesController(countryId);

  const [alcance, setAlcance] = useState<'ready' | 'incomplete' | 'all'>('ready');
  const [modal, setModal] = useState<{ trip: TripRecord | null; settlement: SettlementRecord | null } | null>(null);
  const [detalle, setDetalle] = useState<SettlementRecord | null>(null);

  const visibles = useMemo(
    () => (alcance === 'ready' ? listos : alcance === 'incomplete' ? incompletos : trips),
    [alcance, listos, incompletos, trips],
  );

  const numeroDe = useMemo(
    () => new Map(settlements.map((s) => [s.id, s.number])),
    [settlements],
  );

  const moneda = activeCountry?.local_currency ?? '';

  if (loadingCountries) {
    return <div className="p-6 text-center text-slate-500"><i className="ri-loader-4-line animate-spin text-2xl" /></div>;
  }

  const settlementCols = extendida
    ? getSettlementColumnsExtended(numeroDe, canEdit, changeStatus)
    : getSettlementColumns(numeroDe, canEdit, changeStatus);

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

      <CountryScopeBar country={activeCountry} problem={problem} selectedName={selectedName} loading={loadingCountries} />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Listos" value={String(listos.length)} icon="ri-route-line" color="teal" />
        <StatCard title="Incompletos" value={String(incompletos.length)} icon="ri-error-warning-line" color="amber" />
        <StatCard title="Total liquidado" value={formatMoney(kpis.total, moneda)} icon="ri-money-dollar-circle-line" color="emerald" />
        <StatCard title="Sin aprobar" value={formatMoney(kpis.pendiente, moneda)} icon="ri-time-line" color="amber" />
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div className="flex border-b border-slate-200">
            <button type="button" className={getTabClass(tab, 'trips')} onClick={() => setTab('trips')}>
              Por Liquidar
            </button>
            <button type="button" className={getTabClass(tab, 'history')} onClick={() => setTab('history')}>
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
            maxVisibleRows={5}
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
                  <i className="ri-calculator-line mr-1" />
                  Liquidar
                </Button>
              );
            }}
          />
        ) : (
          <DataTable
            maxVisibleRows={5}
            data={settlements}
            columns={settlementCols}
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
                <Button variant="ghost" size="sm" onClick={() => setDetalle(s)} title="Ver el desglose">
                  <i className="ri-eye-line" />
                </Button>
                {canEdit && !s.supersededBy && s.status !== 'Anulado' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModal({ trip: null, settlement: s })}
                    title="Re-liquidar el viaje"
                  >
                    <i className="ri-refresh-line" />
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
        onSaved={(saved) => { reload(); setDetalle(saved); }}
      />

      <DetalleLiquidacionModal settlement={detalle} onClose={() => setDetalle(null)} />
    </div>
  );
}
