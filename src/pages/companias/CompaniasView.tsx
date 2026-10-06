// Vista compartida de las compañías a liquidar. UNA entidad y UN cálculo debajo; lo que cambia
// entre flota propia y terceros es qué se exige, qué se muestra y en qué pantalla se administra.
//
// Por eso hay dos rutas (`/tarifas/flota-propia` y `/tarifas/transportistas`) sobre este mismo
// componente, en vez de un listado único con un filtro: el objetivo declarado es que el usuario no
// confunda responsabilidades — administrar recursos internos no es lo mismo que contratar a un
// tercero.
//
// La lista sale del catálogo de transportistas (solo lectura); acá solo se configura el cálculo
// (variables, estructura de costos, tarifarios) sobre el perfil de cada transportista.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import VariablesModal from './components/VariablesModal';
import CostStructureModal from './components/CostStructureModal';
import RateTablesModal from './components/RateTablesModal';
import { loadZones } from '../../lib/tarifas/catalogLoader';
import {
  deactivateParty, listCarrierProfiles, reactivateParty,
} from '../../lib/tarifas/partiesDataSource';
import type { CarrierProfile, PartyClassification } from '../../lib/tarifas/parties';
import { useAuth } from '../../hooks/useAuth';
import { registrarEvento } from '../../lib/liquidador/auditLog';
import { getActorRole } from '../../lib/tarifas/actor';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import { useTarifasActor } from '../../hooks/useTarifasActor';
import CountryScopeBar from '../../components/feature/CountryScopeBar';
import DataModeBanner from '../../components/tarifas/DataModeBanner';
import { useActiveCountry } from '../../hooks/useActiveCountry';

interface Copy {
  title: string;
  subtitle: string;
  icon: string;
  emptyTitle: string;
  emptyHint: string;
  intro: string;
}

const COPY: Record<PartyClassification, Copy> = {
  OWN: {
    title: 'Flota Propia',
    subtitle: 'Compañías propias a las que se les liquida el viaje con recursos internos',
    icon: 'ri-home-gear-line',
    emptyTitle: 'Todavía no hay compañías propias',
    emptyHint: 'Se dan de alta en Catálogos → Transportistas, como flota propia.',
    intro:
      'Acá administrás recursos internos: los conductores están en nómina y el costo del viaje se ' +
      'arma con la estructura de costos detallada de la compañía (combustible, depreciación, ' +
      'salarios, mantenimiento). No se factura contra un tercero. La lista sale del catálogo ' +
      '(solo lectura): acá solo se configura el cálculo.',
  },
  OUTSOURCED: {
    title: 'Transportistas a Liquidar',
    subtitle: 'Terceros contratados a los que se les paga el viaje',
    icon: 'ri-truck-line',
    emptyTitle: 'Todavía no hay transportistas cargados',
    emptyHint: 'Se dan de alta en Catálogos → Transportistas, como terceros.',
    intro:
      'Acá solo hace falta con qué cobrarle al tercero: identificación fiscal y sus condiciones de ' +
      'cobro. No lleva costos internos ni nómina — eso es de la flota propia. La lista sale del ' +
      'catálogo (solo lectura): acá solo se configura el cálculo.',
  },
};

const isInactive = (p: CarrierProfile) =>
  p.carrierStatus === 'inactive' || p.profileStatus === 'inactive';

export default function CompaniasView({ classification }: { classification: PartyClassification }) {
  const copy = COPY[classification];
  const isOutsourced = classification === 'OUTSOURCED';

  const { appUser } = useAuth();
  const usuarioActivo = appUser?.full_name || appUser?.email || 'Usuario';
  const { canEdit } = useModulePermissions('tarifas.config');
  useTarifasActor();

  const {
    countries, country: activeCountry, countryId, problem, selectedName, loading: loadingCountries,
  } = useActiveCountry();

  const [profiles, setProfiles] = useState<CarrierProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [variablesFor, setVariablesFor] = useState<CarrierProfile | null>(null);
  const [costsFor, setCostsFor] = useState<CarrierProfile | null>(null);
  const [ratesFor, setRatesFor] = useState<CarrierProfile | null>(null);
  const [actionError, setActionError] = useState('');
  const [zonas, setZonas] = useState<{ id: string; code: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setProfiles(await listCarrierProfiles({
        classification,
        countryId: countryId || undefined,
        includeInactive: true,
      }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [classification, countryId]);

  // Esperar a los países: antes de eso `countryId` es '' y se pediría todo el catálogo para repetirlo filtrado.
  useEffect(() => { if (!loadingCountries) void load(); }, [load, loadingCountries]);

  const currency = activeCountry?.local_currency ?? 'moneda local';

  // Las zonas del país activo, para que el tarifario pueda sugerir códigos en sus columnas.
  useEffect(() => {
    if (loadingCountries) return undefined;
    let cancelled = false;
    loadZones(activeCountry?.id)
      .then((list) => {
        if (!cancelled) setZonas(list.map((z) => ({ id: z.id, code: z.code, name: z.name })));
      })
      .catch(() => { if (!cancelled) setZonas([]); });
    return () => { cancelled = true; };
  }, [activeCountry?.id, loadingCountries]);

  const visible = useMemo(
    () => profiles.filter((p) => showInactive || !isInactive(p)),
    [profiles, showInactive],
  );

  const handleToggleStatus = async (profile: CarrierProfile) => {
    if (!profile.partyId) return;
    setActionError('');
    const reactivating = profile.profileStatus === 'inactive';

    try {
      if (!reactivating) {
        const ok = window.confirm(
          `¿Desactivar el cálculo de "${profile.name}"?\n\nNo se borra: sale de los selectores pero las ` +
          `liquidaciones ya emitidas la conservan intacta, porque el histórico es inmutable. ` +
          `El transportista sigue en el catálogo.`,
        );
        if (!ok) return;
      }

      const result = reactivating
        ? await reactivateParty(profile.partyId)
        : await deactivateParty(profile.partyId);
      if (result.error) {
        setActionError(result.error.message);
        return;
      }

      await registrarEvento({
        entidad: 'settlement_party',
        entidadId: profile.partyId,
        accion: 'UPDATE',
        usuario: usuarioActivo,
        rol: getActorRole(),
        antes: { status: profile.profileStatus },
        despues: { status: reactivating ? 'active' : 'inactive' },
        motivo: reactivating ? 'Reactivación' : 'Baja lógica',
      });
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  // Desactivar/reactivar un cálculo es una edición del perfil de la compañía.
  const puedeDesactivar = canEdit;

  const countryLabel = (profile: CarrierProfile) => {
    const country = countries.find((c) => c.id === profile.countryId);
    return country ? `${country.name} (${country.local_currency})` : 'País no configurado';
  };

  const columns: DataTableColumn<CarrierProfile>[] = [
    {
      key: 'code',
      header: 'Código',
      accessor: (p) => p.code,
      sortable: true,
      render: (p) => <span className="font-mono text-slate-600">{p.code}</span>,
    },
    {
      key: 'name',
      header: 'Nombre',
      accessor: (p) => p.name,
      sortable: true,
      render: (p) => <span className="font-medium text-slate-800">{p.name}</span>,
    },
    ...(isOutsourced
      ? [{
        key: 'taxId',
        header: 'Identificación fiscal',
        accessor: (p: CarrierProfile) => p.taxId ?? '',
        sortable: true,
        render: (p: CarrierProfile) => (p.taxId
          ? <span className="text-slate-600">{p.taxId}</span>
          : <span className="text-amber-600 text-xs">Falta — no se le puede liquidar</span>),
      } satisfies DataTableColumn<CarrierProfile>]
      : []),
    {
      key: 'country',
      header: 'País / Moneda',
      accessor: (p) => countryLabel(p),
      sortable: true,
      filterable: true,
    },
    {
      key: 'profile',
      header: 'Cálculo',
      accessor: (p) => (p.partyId ? 'Configurado' : 'Sin configurar'),
      filterable: true,
      render: (p) => (p.partyId
        ? <Badge variant="success" size="sm">Configurado</Badge>
        : <span className="text-xs text-slate-400">Sin configurar</span>),
    },
    {
      key: 'status',
      header: 'Estado',
      accessor: (p) => (isInactive(p) ? 'Desactivada' : 'Activa'),
      sortable: true,
      filterable: true,
      render: (p) => (
        <Badge variant={isInactive(p) ? 'default' : 'success'} size="sm">
          {isInactive(p) ? 'Desactivada' : 'Activa'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <i className={`${copy.icon} text-2xl text-teal-600`}></i>
          <h1 className="text-2xl font-bold text-slate-800">{copy.title}</h1>
          <Badge variant={isOutsourced ? 'warning' : 'info'}>
            {isOutsourced ? 'Terceros' : 'Recursos internos'}
          </Badge>
        </div>
        <p className="text-sm text-slate-500 mt-1">{copy.subtitle}</p>
      </div>

      <DataModeBanner />
      <CountryScopeBar
        country={activeCountry}
        problem={problem}
        selectedName={selectedName}
        loading={loadingCountries}
      />

      <div
        className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 border ${
          isOutsourced
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

      <Card>
        <label className="flex items-center gap-2 text-sm text-slate-600 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          Ver desactivadas
        </label>

        <DataTable
          data={visible}
          columns={columns}
          getRowId={(p) => p.carrierId}
          loading={loading}
          searchPlaceholder="Buscar por nombre, código o identificación fiscal..."
          exportFileName={isOutsourced ? 'transportistas_a_liquidar' : 'flota_propia'}
          columnsKey={`tarifas.${isOutsourced ? 'transportistas_a_liquidar' : 'flota_propia'}`}
          emptyMessage={`${copy.emptyTitle}. ${copy.emptyHint}`}
          actions={(profile) => (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCostsFor(profile)}
                title="Estructura de costos de esta compañía"
              >
                <i className="ri-table-line"></i>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRatesFor(profile)}
                title="Tarifarios: el precio de cada ruta"
              >
                <i className="ri-price-tag-3-line"></i>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVariablesFor(profile)}
                title="Variables propias de esta compañía"
              >
                <i className="ri-code-box-line"></i>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleToggleStatus(profile)}
                disabled={!puedeDesactivar || !profile.partyId}
                title={!canEdit
                  ? 'Tu rol no puede desactivar compañías'
                  : !profile.partyId
                  ? 'Sin cálculo configurado: no hay nada que desactivar'
                  : profile.profileStatus === 'inactive' ? 'Reactivar cálculo' : 'Desactivar cálculo'}
              >
                <i className={profile.profileStatus === 'inactive' ? 'ri-refresh-line' : 'ri-forbid-line'}></i>
              </Button>
            </>
          )}
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
