// El Probador del motor.
//
// Qué es: el banco de pruebas donde se arma un viaje y se ve el total con su desglose, sin emitir
// nada. Sirve para dos cosas distintas y las dos importan — entender por qué una regla cobra lo que
// cobra, y demostrarle a alguien que el cálculo hace lo que se dice que hace.
//
// Dos modos:
//
//   · **Desde un viaje**: se elige un viaje COMPLETADO de guía de despacho y se calcula con
//     `calculateTrip`, el mismo camino que usa la liquidación. Los datos del viaje son de solo
//     lectura; lo único que se prueba a mano son las variables personalizadas de la compañía.
//   · **Viaje libre**: se arma un `TripContext` a mano, para inventar combinaciones que ningún
//     viaje real produce — que es justamente lo que un probador tiene que permitir. Peajes,
//     recolectas y demás van como variables propias de la compañía (`custom:*`).
//
// Las plantillas son escenarios: cada una declara cuánto **debe** dar, el Probador muestra el
// veredicto, y un test recorre todas y se pone rojo si un total se movió.

import { useMemo, useState } from 'react';
import Card from '../../../components/base/Card';
import TesterLeftCard from './rule-tester/TesterLeftCard';
import TesterResultCard from './rule-tester/TesterResultCard';
import { useTesterForm } from './rule-tester/useTesterForm';
import { useTesterBase } from './rule-tester/useTesterBase';
import { useTesterCatalog } from './rule-tester/useTesterCatalog';
import { useTesterDefaults } from './rule-tester/useTesterDefaults';
import { useTesterCalculation } from './rule-tester/useTesterCalculation';
import { useTesterScenario } from './rule-tester/useTesterScenario';

interface RuleTesterProps {
  organizationId: string;
}

export default function RuleTester({ organizationId }: RuleTesterProps) {
  const form = useTesterForm();
  const [error, setError] = useState('');
  const { modo, countryId, tripId, viajePartyId, libre, dia, customRaw } = form;

  const base = useTesterBase({ organizationId, countryId, setCountryId: form.setCountryId, setError });

  const libreCarrier = useMemo(
    () => base.carriers.find((c) => c.carrierId === libre.carrierId) ?? null,
    [base.carriers, libre.carrierId],
  );
  const partyId = modo === 'viaje' ? viajePartyId : (libreCarrier?.partyId ?? null);
  const trip = useMemo(() => base.trips.find((t) => t.id === tripId) ?? null, [base.trips, tripId]);

  const { catalog, catalogError, zones, customFields, constantes } = useTesterCatalog(countryId, partyId);
  useTesterDefaults({
    customFields, zones, pendientes: form.pendientes, setCustomRaw: form.setCustomRaw, setLibre: form.setLibre,
  });

  const { calculo, calculando } = useTesterCalculation({
    modo, trip, libre, libreCarrier, dia, customFields, customRaw, catalog, countryId,
    setViajePartyId: form.setViajePartyId, setError,
  });

  const { veredicto, aplicarEscenario, fijarEsperado, guardando } = useTesterScenario({
    organizationId, form, templates: base.templates, setTemplates: base.setTemplates,
    carriers: base.carriers, calculo, setError,
  });

  if (base.cargando) {
    return (
      <Card>
        <div className="text-center py-10 text-slate-500">
          <i className="ri-loader-4-line animate-spin text-2xl"></i>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <TesterLeftCard
        form={form} templates={base.templates} countries={base.countries} carriers={base.carriers}
        trips={base.trips} trip={trip} loadingTrips={base.loadingTrips} truckTypes={base.truckTypes}
        zones={zones} catalogError={catalogError} libreCarrier={libreCarrier}
        customFields={customFields} constantes={constantes} calculando={calculando}
        onReload={() => void base.recargar()} onApplyScenario={aplicarEscenario}
      />
      <TesterResultCard
        calculo={calculo} calculando={calculando} error={error} modo={modo} veredicto={veredicto}
        guardando={guardando} customFields={customFields} constantes={constantes}
        onFix={() => void fijarEsperado()}
      />
    </div>
  );
}
