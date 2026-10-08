import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CapacityBar from './CapacityBar';
import TripMapa, { type ParadaMapa } from './TripMapa';
import ParadaModal from './ParadaModal';
import PuntoModal from './PuntoModal';
import ViajePedidosModal from './ViajePedidosModal';
import { coloresPorPunto } from '../colores-parada';
import { cancelarViaje, completarViaje, reabrirViaje } from '../planes-api';
import type { PlanStop, PlanTrip, TripStatus } from '../planes-types';

interface Props {
  trip: PlanTrip;
  indice: number;
  zonaNombre?: string;
  editable: boolean;
  // Otros viajes a los que se puede mover un pedido (id + etiqueta).
  destinos: { id: string; label: string }[];
  onMover: (orderId: string, toTripId: string) => void;
  // Recargar tras completar/cancelar un viaje (solo en la vista de planes guardados).
  onViajeActualizado?: () => void | Promise<void>;
}

// Pill de estado del viaje (independiente del plan).
const ESTADO_VIAJE: Record<TripStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
};

// Tarjeta de una ruta: zona (identidad), vehículo, mapa (OSRM), barras de
// capacidad y la secuencia de paradas. Las coords salen directo de la parada
// (stop.delivery_latitude/longitude, que el backend embebe), así el mismo
// componente sirve en PlanEditor y en PlanesTab sin depender de pedidos cargados.
// En draft, cada parada se puede mover a otra ruta.
export default function PlanTripCard({
  trip,
  indice,
  zonaNombre,
  editable,
  destinos,
  onMover,
  onViajeActualizado,
}: Props) {
  const { t } = useTranslation();
  const [paradaSel, setParadaSel] = useState<PlanStop | null>(null);
  const [puntoSel, setPuntoSel] = useState<PlanStop[] | null>(null);
  const [verPedidos, setVerPedidos] = useState(false);
  const [verTodasParadas, setVerTodasParadas] = useState(false);
  const [procesando, setProcesando] = useState(false);

  // Click en un pin del mapa: si ese punto (coordenadas) tiene varios pedidos,
  // abre la tabla del punto (PuntoModal); si es uno solo, va directo al detalle.
  function abrirDesdeMapa(orderId: string) {
    const stop = trip.stops.find((s) => s.order_id === orderId);
    if (!stop) return;
    const mismoPunto = trip.stops.filter(
      (s) =>
        s.delivery_latitude != null &&
        s.delivery_longitude != null &&
        s.delivery_latitude === stop.delivery_latitude &&
        s.delivery_longitude === stop.delivery_longitude,
    );
    if (mismoPunto.length > 1) setPuntoSel(mismoPunto);
    else setParadaSel(stop);
  }

  const ACCIONES = { completar: completarViaje, cancelar: cancelarViaje, reabrir: reabrirViaje };

  async function transicionarViaje(accion: keyof typeof ACCIONES) {
    setProcesando(true);
    try {
      const r = await ACCIONES[accion](trip.id);
      if (r) await onViajeActualizado?.();
    } finally {
      setProcesando(false);
    }
  }
  const titulo = zonaNombre || trip.delivery_zone;
  const mostrarCodigo = zonaNombre && zonaNombre !== trip.delivery_zone;
  const hayPeso = trip.total_weight != null;
  const hayVolumen = trip.total_volume != null;

  // Color por punto de entrega: pedidos que van a la misma parada (mismas
  // coordenadas) comparten color, tanto en la lista como en los pines del mapa.
  const { colorDe, puntos } = useMemo(() => coloresPorPunto(trip.stops), [trip.stops]);

  // Paradas ubicadas para el mapa (solo las que tienen coordenadas).
  const paradasMapa = useMemo<ParadaMapa[]>(
    () =>
      trip.stops
        .filter((s) => typeof s.delivery_latitude === 'number' && typeof s.delivery_longitude === 'number')
        .map((s) => ({
          id: s.order_id,
          delivery_latitude: s.delivery_latitude as number,
          delivery_longitude: s.delivery_longitude as number,
          stop_number: s.stop_order,
          color: colorDe.get(s.order_id),
        })),
    [trip.stops, colorDe],
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
      <div className="p-4 pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-teal-600 uppercase tracking-wide flex items-center gap-1">
              <i className="ri-route-line"></i>
              {t('planning.routeWord')} {indice + 1}
            </p>
            <h3 className="text-base font-bold text-slate-800 truncate">{titulo}</h3>
            {mostrarCodigo && (
              <p className="text-[10px] text-slate-400 font-mono">{t('planning.zoneCode')} {trip.delivery_zone}</p>
            )}
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <i className="ri-truck-line"></i>
              <span className="truncate">{trip.vehicle_plate} · {trip.vehicle_label}</span>
              {trip.is_flota_propia && (
                <span className="shrink-0 text-teal-600 font-medium">· {t('planning.ownFleet')}</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVerPedidos(true)}
            className="text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 font-semibold px-2.5 py-1 rounded-full shrink-0 text-center leading-tight cursor-pointer inline-flex items-center gap-1"
          >
            <i className="ri-list-check-2"></i>
            <span>
              {t('planning.viewOrders')}
              <br />
              {puntos} {puntos === 1 ? t('planning.pointWord') : t('planning.pointsWord')} · {trip.stops.length}{' '}
              {t('planning.ordersWord')}
            </span>
          </button>
        </div>

        {(hayPeso || hayVolumen) && (
          <div className="space-y-2 mt-3">
            {hayPeso && (
              <CapacityBar icon="ri-scales-3-line" label={t('planning.weight')} value={trip.total_weight as number}
                max={trip.vehicle_capacity_weight} unit="kg" />
            )}
            {hayVolumen && (
              <CapacityBar icon="ri-box-3-line" label={t('planning.volume')} value={trip.total_volume as number}
                max={trip.vehicle_capacity_volume} unit="m³" decimals={2} />
            )}
          </div>
        )}

        {/* Estado del viaje + acciones (completar/cancelar). Las acciones solo
            en planes guardados (no editable) y mientras el viaje está pendiente. */}
        <div className="flex items-center gap-2 mt-3">
          <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${ESTADO_VIAJE[trip.status]}`}>
            {t(`planning.status.${trip.status}`)}
          </span>
          {!editable && (
            <div className="flex items-center gap-1.5 ml-auto">
              {trip.status !== 'completed' && (
                <button
                  onClick={() => transicionarViaje('completar')}
                  disabled={procesando}
                  className="text-[11px] px-2 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg cursor-pointer inline-flex items-center gap-1"
                >
                  <i className="ri-check-double-line"></i>{t('planning.complete')}
                </button>
              )}
              {trip.status !== 'cancelled' && (
                <button
                  onClick={() => transicionarViaje('cancelar')}
                  disabled={procesando}
                  className="text-[11px] px-2 py-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg cursor-pointer inline-flex items-center gap-1"
                >
                  <i className="ri-close-line"></i>{t('planning.cancel')}
                </button>
              )}
              {trip.status !== 'pending' && (
                <button
                  onClick={() => transicionarViaje('reabrir')}
                  disabled={procesando}
                  className="text-[11px] px-2 py-1 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 rounded-lg cursor-pointer inline-flex items-center gap-1"
                >
                  <i className="ri-refresh-line"></i>{t('planning.reopen')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mapa de la ruta por calles (OSRM) con las paradas numeradas. */}
      <div className="p-3">
        <TripMapa paradas={paradasMapa} onParadaClick={abrirDesdeMapa} />
      </div>

      <ol className="px-4 pb-4 space-y-1.5">
        {(verTodasParadas ? trip.stops : trip.stops.slice(0, 3)).map((s) => {
          const nombre = s.customer_name || s.order_number || s.order_id.slice(0, 8);
          return (
            <li
              key={s.id || s.order_id}
              role="button"
              tabIndex={0}
              onClick={() => setParadaSel(s)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setParadaSel(s);
                }
              }}
              className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer rounded hover:bg-slate-50 px-1 -mx-1 py-0.5"
            >
              <span
                className="w-5 h-5 flex items-center justify-center text-white rounded-full font-semibold shrink-0"
                style={{ backgroundColor: colorDe.get(s.order_id) }}
                title={t('planning.samePointHint')}
              >
                {s.stop_order}
              </span>
              <span className="truncate flex-1">
                {nombre}
                {s.delivery_city && <span className="text-slate-400"> — {s.delivery_city}</span>}
              </span>
              {editable && destinos.length > 0 && (
                <select
                  aria-label={`Mover ${nombre}`}
                  className="text-[11px] border border-slate-200 rounded px-1 py-0.5 bg-white cursor-pointer shrink-0"
                  value=""
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => e.target.value && onMover(s.order_id, e.target.value)}
                >
                  <option value="">{t('planning.moveTo')}</option>
                  {destinos.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
        {trip.stops.length === 0 && (
          <li className="text-xs text-slate-400 italic py-1">{t('planning.noStops')}</li>
        )}
        {trip.stops.length > 3 && (
          <li>
            <button
              type="button"
              onClick={() => setVerTodasParadas((v) => !v)}
              className="w-full mt-1 text-xs font-semibold text-teal-700 hover:text-teal-800 hover:bg-teal-50 rounded py-1.5 cursor-pointer inline-flex items-center justify-center gap-1"
            >
              <i className={verTodasParadas ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}></i>
              {verTodasParadas
                ? t('planning.viewLessStops')
                : t('planning.viewAllStops', { count: trip.stops.length })}
            </button>
          </li>
        )}
      </ol>

      <PuntoModal
        stops={puntoSel}
        color={puntoSel ? colorDe.get(puntoSel[0].order_id) : undefined}
        onVerDetalle={(s) => setParadaSel(s)}
        onClose={() => setPuntoSel(null)}
      />
      {verPedidos && <ViajePedidosModal trip={trip} onClose={() => setVerPedidos(false)} />}
      {/* El detalle de parada va DE ÚLTIMO: mismo z-index que los otros modales,
          así que debe ir después en el DOM para quedar ENCIMA (p.ej. al abrir el
          detalle desde la tabla del punto). */}
      <ParadaModal parada={paradaSel} onClose={() => setParadaSel(null)} />
    </div>
  );
}
