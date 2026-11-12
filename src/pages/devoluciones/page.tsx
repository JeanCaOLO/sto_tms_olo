// Devoluciones: lo que los conductores devolvieron desde tracking, por viaje. Quien recibe en bodega marca cada
// devolución como "Recibido"; cuando todas las de un viaje están recibidas el viaje queda listo para liquidar
// (Liquidaciones no deja liquidar un viaje con devoluciones sin recibir). Cada viaje tiene su formulario imprimible.
import { useCallback, useRef, useState } from 'react';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import TabBar from '../../components/base/TabBar';
import { tabPanelProps } from '../../components/base/tabPanelProps';
import DateRangeFilter from '../../components/feature/DateRangeFilter';
import StatCard from '../../components/feature/StatCard';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import { useOperationalContext } from '../../hooks/useOperationalContext';
import type { DateRange } from '../../lib/tarifas/proformas/dateRange';
import { rangeFor } from '../../lib/tarifas/proformas/dateRange';
import type { TripFilter } from '../../lib/devoluciones/types';
import { useReturnTrips } from './hooks/useReturnTrips';
import TripCard from './parts/TripCard';
import {useAuth} from '../../hooks/useAuth';
import {usePermissions} from '../../hooks/usePermissions';
import RequestInbox from './solicitudes/RequestInbox';
import type {DecisionAttempts} from './solicitudes/DecisionActions';

const TABS: { key: TripFilter; label: string }[] = [
  { key: 'pendientes', label: 'Por recibir' },
  { key: 'recibidos', label: 'Listos para liquidar' },
  { key: 'todos', label: 'Todos' },
];
const EMPTY: Record<TripFilter, string> = {
  pendientes: 'No hay viajes con devoluciones por recibir.',
  recibidos: 'Ningún viaje tiene todas sus devoluciones recibidas en este periodo.',
  todos: 'No hay viajes con devoluciones en este periodo.',
};

const tabClass = (active: boolean) =>
  `px-4 py-2 text-sm font-medium border-b-2 cursor-pointer ${active ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`;

export default function DevolucionesPage() {
  const {user,loading}=useAuth();
  if(loading)return <p role="status">Cargando sesión…</p>;
  if(!user)return <p role="alert">Inicie sesión para consultar devoluciones.</p>;
  return <DevolucionesWorkspace key={user.id}/>;
}

function DevolucionesWorkspace() {
  const {can,loading}=usePermissions();
  const {selectedCountryId}=useOperationalContext();
  const [section,setSection]=useState<'viajes'|'solicitudes'>('viajes');
  const attempts=useRef<DecisionAttempts>(new Map());
  const [,setAttemptVersion]=useState(0);
  const onAttemptsChanged=useCallback(()=>setAttemptVersion(v=>v+1),[]);
  if(loading)return <p role="status">Cargando permisos…</p>;
  if(!can('devoluciones','view'))return <p role="alert">No tiene permiso para consultar devoluciones.</p>;
  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Devoluciones</h1>
      <p className="mt-1 text-sm text-gray-600">{section==='viajes'
        ? 'Recibe en bodega la mercadería devuelta por los conductores. Un viaje se liquida cuando todas sus devoluciones están recibidas.'
        : 'Revise las solicitudes de recolecta. La decisión comercial se registra por separado de la recepción en almacén.'}</p>
    </div>
    <TabBar<'viajes'|'solicitudes'> tabs={[{key:'viajes',label:'Recepción por viajes'},{key:'solicitudes',label:'Solicitudes'}]}
      value={section} onChange={setSection} ariaLabel="Secciones de devoluciones" idBase="devoluciones-secciones" tabClassName={tabClass}/>
    <div {...tabPanelProps('devoluciones-secciones','viajes')} hidden={section!=='viajes'}><ReturnsByTrip/></div>
    {section==='solicitudes'&&<div {...tabPanelProps('devoluciones-secciones','solicitudes')}><RequestInbox countryId={selectedCountryId}
      attempts={attempts.current} onAttemptsChanged={onAttemptsChanged}/></div>}
  </div>;
}

function ReturnsByTrip() {
  const { canEdit, canExport } = useModulePermissions('devoluciones');
  const { selectedCountryId } = useOperationalContext();
  const [tab, setTab] = useState<TripFilter>('pendientes');
  // Por defecto sin límite de fechas: una devolución pendiente de hace semanas no puede quedar oculta.
  const [range, setRange] = useState<DateRange>(() => rangeFor('all'));
  const { summary, trips, loading, error, reload, hasMore, loadingMore, loadMoreError, loadMore } = useReturnTrips(tab, range.from, range.to, selectedCountryId);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <StatCard title="Viajes con devoluciones" value={summary?.trips ?? '-'} icon="ri-route-line" />
        <StatCard title="Viajes por recibir" value={summary?.trips_pending ?? '-'} icon="ri-time-line" color="amber" />
        <StatCard title="Listos para liquidar" value={summary?.trips_ready ?? '-'} icon="ri-checkbox-circle-line" color="emerald" />
        <StatCard title="Devoluciones por recibir" value={summary?.returns_pending ?? '-'} icon="ri-arrow-go-back-line" color="blue" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabBar<TripFilter> tabs={TABS} value={tab} onChange={setTab} ariaLabel="Estado de los viajes" idBase="devoluciones"
            tabClassName={tabClass} className="flex gap-1 border-b border-slate-200" />
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </Card>

      <div {...tabPanelProps('devoluciones', tab)} className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error} <button type="button" className="underline cursor-pointer" onClick={reload}>Reintentar</button>
          </p>
        )}
        {loading && trips.length === 0 && <p role="status" className="text-sm text-slate-500">Cargando…</p>}
        {!loading && !error && trips.length === 0 && <p className="text-sm text-slate-500">{EMPTY[tab]}</p>}
        {trips.map((trip) => (
          <TripCard key={trip.route_id} trip={trip} canEdit={canEdit} canPrint={canExport} onChanged={reload} />
        ))}
        {loadMoreError && <p role="alert" className="text-sm text-red-600">{loadMoreError}</p>}
        {hasMore && (
          <div className="flex justify-center">
            <Button variant="secondary" disabled={loading || loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Cargando más…' : loadMoreError ? 'Reintentar cargar más' : 'Cargar más viajes'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
