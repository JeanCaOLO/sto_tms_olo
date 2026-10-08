// Vista compartida de las compañías a liquidar. UNA entidad y UN cálculo debajo; lo que cambia
// entre flota propia y terceros es qué se exige, qué se muestra y en qué pantalla se administra.
//
// Por eso hay dos pestañas en `/tarifas/costos-flota` (antes dos rutas) sobre este mismo
// componente, en vez de un listado único con un filtro: el objetivo declarado es que el usuario no
// confunda responsabilidades — administrar recursos internos no es lo mismo que contratar a un
// tercero.
//
// La lista sale del catálogo de transportistas (solo lectura); acá solo se configura el cálculo
// (variables, estructura de costos, tarifarios) sobre el perfil de cada transportista.

import { useState } from 'react';
import Card from '../../components/base/Card';
import Badge from '../../components/base/Badge';
import VariablesModal from './components/VariablesModal';
import CostStructureModal from './components/CostStructureModal';
import RateTablesModal from './components/RateTablesModal';
import { CompaniasTable } from './components/CompaniasTable';
import { useCompaniasList } from './hooks/useCompaniasList';
import { useCountryZones } from './hooks/useCountryZones';
import type { CarrierProfile, PartyClassification } from '../../lib/tarifas/parties';
import { useAuth } from '../../hooks/useAuth';
import { registrarEvento } from '../../lib/liquidador/auditLog';
import { getActorRole } from '../../lib/tarifas/actor';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import { useTarifasActor } from '../../hooks/useTarifasActor';
import CountryScopeBar from '../../components/feature/CountryScopeBar';
import { useActiveCountry } from '../../hooks/useActiveCountry';
import CountryCostStructure from './components/CountryCostStructure';

interface Copy {
  title: string;
  subtitle: string;
  icon: string;
  intro: string;
}

const COPY: Record<PartyClassification, Copy> = {
  OWN: {
    title: 'Flota Propia',
    subtitle: 'Compañías propias a las que se les liquida el viaje con recursos internos',
    icon: 'ri-home-gear-line',
    intro:
      'Acá administrás recursos internos: los conductores están en nómina y el costo del viaje se ' +
      'arma con la estructura de costos detallada de la compañía (combustible, depreciación, ' +
      'salarios, mantenimiento). No se factura contra un tercero. La lista sale del catálogo ' +
      '(solo lectura): acá solo se configura el cálculo.',
  },
  OUTSOURCED: {
    title: 'Flota Externa',
    subtitle: 'Terceros contratados a los que se les paga el viaje',
    icon: 'ri-truck-line',
    intro:
      'Acá solo hace falta con qué cobrarle al tercero: identificación fiscal y sus condiciones de ' +
      'cobro. No lleva costos internos ni nómina — eso es de la flota propia. La lista sale del ' +
      'catálogo (solo lectura): acá solo se configura el cálculo.',
  },
};

export default function CompaniasView({ classification }: { classification: PartyClassification }) {
  const copy = COPY[classification];

  const { appUser } = useAuth();
  const usuarioActivo = appUser?.full_name || appUser?.email || 'Usuario';
  const { canEdit } = useModulePermissions('tarifas.config');
  useTarifasActor();

  const {
    countries, country: activeCountry, countryId, problem, selectedName, loading: loadingCountries,
  } = useActiveCountry();

  const [variablesFor, setVariablesFor] = useState<CarrierProfile | null>(null);
  const [costsFor, setCostsFor] = useState<CarrierProfile | null>(null);
  const [ratesFor, setRatesFor] = useState<CarrierProfile | null>(null);
  const [actionError, setActionError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const { profiles, loading, loadError, handleToggleStatus, load } = useCompaniasList(classification, countryId, loadingCountries);
  const zonas = useCountryZones(activeCountry?.id, loadingCountries);

  const currency = activeCountry?.local_currency ?? 'moneda local';

  const handleToggle = async (profile: CarrierProfile) => {
    const result = await handleToggleStatus(profile, usuarioActivo, getActorRole, registrarEvento);
    if (result.error) setActionError(result.error);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <i className={`${copy.icon} text-2xl text-teal-600`}></i>
          <h1 className="text-2xl font-bold text-slate-800">{copy.title}</h1>
          <Badge variant={classification === 'OUTSOURCED' ? 'warning' : 'info'}>
            {classification === 'OUTSOURCED' ? 'Terceros' : 'Recursos internos'}
          </Badge>
        </div>
        <p className="text-sm text-slate-500 mt-1">{copy.subtitle}</p>
      </div>

      <CountryScopeBar
        country={activeCountry}
        problem={problem}
        selectedName={selectedName}
        loading={loadingCountries}
      />

      <div
        className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 border ${
          classification === 'OUTSOURCED'
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-teal-50 border-teal-200 text-teal-800'
        }`}
      >
        <i className="ri-information-line mt-0.5 shrink-0"></i>
        <span>{copy.intro}</span>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {loadError}
        </div>
      )}
      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {actionError}
        </div>
      )}

      {classification === 'OWN' && <CountryCostStructure country={activeCountry} />}

      <Card>
        <CompaniasTable
          classification={classification}
          data={profiles}
          loading={loading}
          countries={countries}
          canEdit={canEdit}
          showInactive={showInactive}
          onShowInactiveChange={setShowInactive}
          onToggleStatus={handleToggle}
          onCostsClick={setCostsFor}
          onRatesClick={setRatesFor}
          onVariablesClick={setVariablesFor}
        />
      </Card>

      <VariablesModal
        isOpen={!!variablesFor}
        party={variablesFor}
        onClose={() => setVariablesFor(null)}
        onProfileCreated={() => void load()}
      />

      <RateTablesModal
        isOpen={!!ratesFor}
        party={ratesFor}
        currency={currency}
        zones={zonas}
        onClose={() => setRatesFor(null)}
        onProfileCreated={() => void load()}
      />

      <CostStructureModal
        isOpen={!!costsFor}
        party={costsFor}
        currency={currency}
        onClose={() => setCostsFor(null)}
        onProfileCreated={() => void load()}
      />
    </div>
  );
}
