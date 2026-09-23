import CompaniasView from '../CompaniasView';

// Transportistas terceros a los que se les liquida el viaje. No confundir con Catálogos →
// Transportistas, que es el maestro operativo del TMS: acá vive solo lo que el tarifador necesita.
export default function TercerosPage() {
  return <CompaniasView classification="OUTSOURCED" />;
}
