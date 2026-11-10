import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { COLOR_HEX } from '../tracking-logic';
import { stopIcon, truckIcon } from './map/icons';

interface Props {
  truck: { lat: number; lng: number };
  destination: { lat: number; lng: number } | null;
}

const TILES_URL = import.meta.env.VITE_MAP_TILES_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Encuadra el camión y el destino; se vuelve a encuadrar cuando el camión se mueve. */
function Encuadre({ truck, destination }: Props) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = [[truck.lat, truck.lng]];
    if (destination) points.push([destination.lat, destination.lng]);
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16, animate: false });
  }, [map, truck.lat, truck.lng, destination?.lat, destination?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Mapa de UNA entrega: el camión que viene y el punto de entrega. Nada más (ni otras paradas ni otros camiones). */
export default function MapaEntrega({ truck, destination }: Props) {
  return (
    <MapContainer center={[truck.lat, truck.lng]} zoom={14} scrollWheelZoom={false} className="h-64 w-full rounded-lg z-0">
      <TileLayer url={TILES_URL} attribution="&copy; OpenStreetMap" />
      {destination && <Marker position={[destination.lat, destination.lng]} icon={stopIcon(1, 'pending', true)} />}
      <Marker position={[truck.lat, truck.lng]} icon={truckIcon(COLOR_HEX.green, false, false)} />
      <Encuadre truck={truck} destination={destination} />
    </MapContainer>
  );
}
