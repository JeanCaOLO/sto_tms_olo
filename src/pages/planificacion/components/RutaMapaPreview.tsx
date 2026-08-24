import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PedidoSeleccionado } from '../types';

interface Props {
  pedidos: PedidoSeleccionado[];
}

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
  const bounds = useMemo(
    () => L.latLngBounds(paradas.map((p) => [p.delivery_latitude, p.delivery_longitude] as [number, number])),
    [paradas],
  );
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  return null;
}

export default function RutaMapaPreview({ pedidos }: Props) {
  const paradas = useMemo(
    () => pedidos.filter(tieneCoordenadas).sort((a, b) => a.stop_number - b.stop_number),
    [pedidos],
  );

  if (paradas.length === 0) {
    return (
      <div className="h-[240px] rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-xs text-slate-400">
        <i className="ri-map-pin-line mr-1.5"></i>Sin coordenadas para mostrar en el mapa
      </div>
    );
  }

  const linea = paradas.map((p) => [p.delivery_latitude, p.delivery_longitude] as [number, number]);
  const centro = linea[0];

  return (
    <div className="h-[240px] rounded-lg overflow-hidden border border-slate-100">
      <MapContainer
        key={paradas.map((p) => p.id).join('-')}
        center={centro}
        zoom={13}
        scrollWheelZoom={false}
        className="w-full h-full"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <Polyline positions={linea} pathOptions={{ color: '#0d9488', weight: 3, opacity: 0.7 }} />
        {paradas.map((p) => (
          <Marker key={p.id} position={[p.delivery_latitude, p.delivery_longitude]} icon={iconoParada(p.stop_number)} />
        ))}
        <AjustarBounds paradas={paradas} />
      </MapContainer>
    </div>
  );
}
