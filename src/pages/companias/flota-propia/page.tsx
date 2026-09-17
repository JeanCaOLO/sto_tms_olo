import CompaniasView from '../CompaniasView';

// Flota propia: compañías internas. Misma entidad que terceros, pantalla distinta a propósito.
export default function FlotaPropiaPage() {
  return <CompaniasView classification="OWN" />;
}
