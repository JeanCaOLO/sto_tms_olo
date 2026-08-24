import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ParadaDetalleModal from './ParadaDetalleModal';
import { obtenerGeometriaRuta } from '../route-geometry';
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

const iconoParada = (numero: number) =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:24px;height:24px;border-radius:9999px;background:#0d9488;color:#fff;
      display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;
      border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);
    ">${numero}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

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
  const [linea, setLinea] = useState<[number, number][]>(() =>
    paradas.map((p) => [p.delivery_latitude, p.delivery_longitude]),
  );
  const [seleccionado, setSeleccionado] = useState<PedidoSeleccionado | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let vigente = true;
    const timer = setTimeout(() => {
      obtenerGeometriaRuta(paradas).then((geo) => { if (vigente) setLinea(geo); });
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
        <Polyline positions={linea} pathOptions={{ color: '#0d9488', weight: 3, opacity: 0.7 }} />
        {paradas.map((p) => (
          <Marker
            key={p.id}
            position={[p.delivery_latitude, p.delivery_longitude]}
            icon={iconoParada(p.stop_number)}
            eventHandlers={{ click: () => setSeleccionado(p) }}
          />
        ))}
        <AjustarBounds paradas={paradas} />
        <EnfocarParada paradas={paradas} paradaId={paradaEnfocadaId} />
      </MapContainer>
      {seleccionado && <ParadaDetalleModal pedido={seleccionado} onClose={() => setSeleccionado(null)} />}
    </div>
  );
}
