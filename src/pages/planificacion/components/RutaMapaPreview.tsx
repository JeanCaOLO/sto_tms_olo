import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ParadaDetalleModal from './ParadaDetalleModal';
import { obtenerGeometriaRutaPorLeg, type Leg } from '../route-geometry';
import type { PedidoSeleccionado } from '../types';

interface Props {
  pedidos: PedidoSeleccionado[];
  alturaClase?: string;
  paradaEnfocadaId?: string;
}

// Espera antes de pedir geometría a OSRM tras un cambio de orden — al
// arrastrar una parada, `reordenarParadas` dispara una vez por índice
// cruzado (no por frame), pero igual puede ser varias veces en un drag
// rápido. El debounce evita golpear el demo público de OSRM en cada paso.
const GEOMETRY_DEBOUNCE_MS = 400;

type ParadaUbicada = PedidoSeleccionado & { delivery_latitude: number; delivery_longitude: number };

const tieneCoordenadas = (p: PedidoSeleccionado): p is ParadaUbicada =>
  typeof p.delivery_latitude === 'number' && typeof p.delivery_longitude === 'number';

const ENTREGA_COLOR = '#0d9488'; // teal
const DEVOLUCION_COLOR = '#4f46e5'; // indigo

const iconoParada = (numero: number, tipo?: 'entrega' | 'devolucion') =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:24px;height:24px;border-radius:9999px;background:${tipo === 'devolucion' ? DEVOLUCION_COLOR : ENTREGA_COLOR};color:#fff;
      display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;
      border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);
    ">${numero}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

// Leyenda (control Leaflet, bottomleft). BR1.4: el mapa distingue devolución
// por color + patrón de línea + esta leyenda textual. Se oculta si no hay
// ninguna devolución en la secuencia.
function Leyenda({ visible }: { visible: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!visible) return;
    const control = new L.Control({ position: 'bottomleft' });
    control.onAdd = () => {
      const div = L.DomUtil.create('div');
      div.style.cssText =
        'background:#fff;padding:4px 8px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,0.3);font-size:11px;line-height:1.5;color:#334155';
      div.innerHTML =
        `<div><span style="display:inline-block;width:18px;border-top:3px solid ${ENTREGA_COLOR};vertical-align:middle;margin-right:4px"></span>entrega</div>` +
        `<div><span style="display:inline-block;width:18px;border-top:3px dashed ${DEVOLUCION_COLOR};vertical-align:middle;margin-right:4px"></span>recolección</div>`;
      return div;
    };
    control.addTo(map);
    return () => { control.remove(); };
  }, [map, visible]);
  return null;
}

function AjustarBounds({ paradas }: { paradas: ParadaUbicada[] }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds(paradas.map((p) => [p.delivery_latitude, p.delivery_longitude] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  }, [map, paradas]);
  return null;
}

// Doble-click en una parada de la lista (fuera del mapa) sube su id hasta
// acá vía prop; este hijo solo escucha el cambio para no correr en cada
// render del mapa.
function EnfocarParada({ paradas, paradaId }: { paradas: ParadaUbicada[]; paradaId?: string }) {
  const map = useMap();
  useEffect(() => {
    if (!paradaId) return;
    const parada = paradas.find((p) => p.id === paradaId);
    if (parada) map.flyTo([parada.delivery_latitude, parada.delivery_longitude], 16);
  }, [map, paradaId, paradas]);
  return null;
}

export default function RutaMapaPreview({ pedidos, alturaClase = 'h-[240px]', paradaEnfocadaId }: Props) {
  const paradas = useMemo(
    () => pedidos.filter(tieneCoordenadas).sort((a, b) => a.stop_number - b.stop_number),
    [pedidos],
  );
  const legsRectos = useMemo<Leg[]>(
    () =>
      paradas.slice(0, -1).map((p, i) => ({
        coords: [
          [p.delivery_latitude, p.delivery_longitude],
          [paradas[i + 1].delivery_latitude, paradas[i + 1].delivery_longitude],
        ],
        fromStopNumber: p.stop_number,
        toStopNumber: paradas[i + 1].stop_number,
      })),
    [paradas],
  );
  const [legs, setLegs] = useState<Leg[]>(legsRectos);
  const [seleccionado, setSeleccionado] = useState<PedidoSeleccionado | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  // BR1.3: un leg es "de recolección" si su parada de origen o destino es
  // devolución. Se mapea por stop_number contra la secuencia ordenada.
  const tipoPorStop = useMemo(() => {
    const m = new Map<number, PedidoSeleccionado['tipo']>();
    paradas.forEach((p) => m.set(p.stop_number, p.tipo));
    return m;
  }, [paradas]);
  const esLegRecoleccion = (leg: Leg) =>
    tipoPorStop.get(leg.fromStopNumber) === 'devolucion' ||
    tipoPorStop.get(leg.toStopNumber) === 'devolucion';
  const hayDevolucion = paradas.some((p) => p.tipo === 'devolucion');

  useEffect(() => {
    let vigente = true;
    const timer = setTimeout(() => {
      obtenerGeometriaRutaPorLeg(paradas).then((geo) => { if (vigente) setLegs(geo); });
    }, GEOMETRY_DEBOUNCE_MS);
    return () => { vigente = false; clearTimeout(timer); };
  }, [paradas]);

  if (paradas.length === 0) {
    return (
      <div className={`${alturaClase} rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-xs text-slate-400`}>
        <i className="ri-map-pin-line mr-1.5"></i>Sin coordenadas para mostrar en el mapa
      </div>
    );
  }

  return (
    <div
      className={`${alturaClase} rounded-lg overflow-hidden border border-slate-100`}
      onMouseEnter={() => mapRef.current?.scrollWheelZoom.enable()}
      onMouseLeave={() => mapRef.current?.scrollWheelZoom.disable()}
    >
      <MapContainer
        key={paradas.map((p) => p.id).join('-')}
        ref={mapRef}
        center={[paradas[0].delivery_latitude, paradas[0].delivery_longitude]}
        zoom={13}
        scrollWheelZoom={false}
        className="w-full h-full"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        {legs.map((leg, i) =>
          esLegRecoleccion(leg) ? (
            <Polyline key={`${leg.fromStopNumber}-${leg.toStopNumber}-${i}`} positions={leg.coords} pathOptions={{ color: DEVOLUCION_COLOR, weight: 3, opacity: 0.8, dashArray: '6 6' }} />
          ) : (
            <Polyline key={`${leg.fromStopNumber}-${leg.toStopNumber}-${i}`} positions={leg.coords} pathOptions={{ color: ENTREGA_COLOR, weight: 3, opacity: 0.7 }} />
          ),
        )}
        {paradas.map((p) => (
          <Marker
            key={p.id}
            position={[p.delivery_latitude, p.delivery_longitude]}
            icon={iconoParada(p.stop_number, p.tipo)}
            eventHandlers={{ click: () => setSeleccionado(p) }}
          />
        ))}
        <AjustarBounds paradas={paradas} />
        <EnfocarParada paradas={paradas} paradaId={paradaEnfocadaId} />
        <Leyenda visible={hayDevolucion} />
      </MapContainer>
      {seleccionado && <ParadaDetalleModal pedido={seleccionado} onClose={() => setSeleccionado(null)} />}
    </div>
  );
}
