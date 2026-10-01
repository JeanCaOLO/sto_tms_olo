import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { obtenerGeometriaRutaPorLeg, type Leg } from '../route-geometry';

// Una parada ubicada del viaje: coords + nº de secuencia (para pintar la ruta).
export interface ParadaMapa {
  id: string;
  delivery_latitude: number;
  delivery_longitude: number;
  stop_number: number;
  label?: string;
}

interface Props {
  paradas: ParadaMapa[];
  alturaClase?: string;
  // Emite el id de la parada al clickear su pin. El componente queda "tonto":
  // la lógica de la modal vive en el padre (PlanTripCard).
  onParadaClick?: (stopId: string) => void;
}

const COLOR = '#0d9488'; // teal (entrega)
const GEOMETRY_DEBOUNCE_MS = 350;

const iconoParada = (numero: number) =>
  L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:${COLOR};color:#fff;
      display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;
      border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);">${numero}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

function AjustarBounds({ paradas }: { paradas: ParadaMapa[] }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds(paradas.map((p) => [p.delivery_latitude, p.delivery_longitude] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  }, [map, paradas]);
  return null;
}

// Mapa de un viaje: paradas numeradas + ruta real por calles (OSRM). Cae a
// segmentos rectos si OSRM no responde (route-geometry ya maneja el fallback).
export default function TripMapa({ paradas, alturaClase = 'h-[220px]', onParadaClick }: Props) {
  const ordenadas = useMemo(
    () => [...paradas].sort((a, b) => a.stop_number - b.stop_number),
    [paradas],
  );
  const legsRectos = useMemo<Leg[]>(
    () =>
      ordenadas.slice(0, -1).map((p, i) => ({
        coords: [
          [p.delivery_latitude, p.delivery_longitude],
          [ordenadas[i + 1].delivery_latitude, ordenadas[i + 1].delivery_longitude],
        ],
        fromStopNumber: p.stop_number,
        toStopNumber: ordenadas[i + 1].stop_number,
      })),
    [ordenadas],
  );
  const [legs, setLegs] = useState<Leg[]>(legsRectos);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    setLegs(legsRectos);
    let vigente = true;
    const timer = setTimeout(() => {
      obtenerGeometriaRutaPorLeg(ordenadas).then((geo) => { if (vigente) setLegs(geo); });
    }, GEOMETRY_DEBOUNCE_MS);
    return () => { vigente = false; clearTimeout(timer); };
  }, [ordenadas, legsRectos]);

  if (ordenadas.length === 0) {
    return (
      <div className={`${alturaClase} rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-xs text-slate-400`}>
        <i className="ri-map-pin-line mr-1.5"></i>Sin coordenadas para el mapa
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
        key={ordenadas.map((p) => p.id).join('-')}
        ref={mapRef}
        center={[ordenadas[0].delivery_latitude, ordenadas[0].delivery_longitude]}
        zoom={12}
        scrollWheelZoom={false}
        className="w-full h-full"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        {legs.map((leg, i) => (
          <Polyline
            key={`${leg.fromStopNumber}-${leg.toStopNumber}-${i}`}
            positions={leg.coords}
            pathOptions={{ color: COLOR, weight: 3, opacity: 0.75 }}
          />
        ))}
        {ordenadas.map((p) => (
          <Marker
            key={p.id}
            position={[p.delivery_latitude, p.delivery_longitude]}
            icon={iconoParada(p.stop_number)}
            eventHandlers={{ click: () => onParadaClick?.(p.id) }}
          />
        ))}
        <AjustarBounds paradas={ordenadas} />
      </MapContainer>
    </div>
  );
}
