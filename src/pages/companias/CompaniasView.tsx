// Vista compartida de las compañías a liquidar. UNA entidad y UN cálculo debajo; lo que cambia
// entre flota propia y terceros es qué se exige, qué se muestra y en qué pantalla se administra.
//
// Por eso hay dos rutas (`/tarifas/flota-propia` y `/tarifas/transportistas`) sobre este mismo
// componente, en vez de un listado único con un filtro: el objetivo declarado es que el usuario no
// confunda responsabilidades — administrar recursos internos no es lo mismo que contratar a un
// tercero.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import CompaniaModal from './components/CompaniaModal';
import VariablesModal from './components/VariablesModal';
import CostStructureModal from './components/CostStructureModal';
import VehicleTypesModal from './components/VehicleTypesModal';
import RoutesModal from './components/RoutesModal';
import RateTablesModal from './components/RateTablesModal';
import { loadZones } from '../../lib/tarifas/catalogLoader';
import {
  countOutsourcedRates, deactivateParty, listParties, reactivateParty,
} from '../../lib/tarifas/partiesDataSource';
import type { PartyClassification, SettlementPartyRow } from '../../lib/tarifas/parties';
import { useAuth } from '../../hooks/useAuth';
import { registrarEvento } from '../../lib/liquidador/auditLog';
import { obtenerRolActivo, puede } from '../../lib/liquidador/rbac';
import CountryScopeBar from '../../components/feature/CountryScopeBar';
import { useActiveCountry } from '../../hooks/useActiveCountry';

interface Copy {
  title: string;
  subtitle: string;
  icon: string;
  newLabel: string;
  emptyTitle: string;
  emptyHint: string;
  intro: string;
}

const COPY: Record<PartyClassification, Copy> = {
  OWN: {
    title: 'Flota Propia',
    subtitle: 'Compañías propias a las que se les liquida el viaje con recursos internos',
    icon: 'ri-home-gear-line',
    newLabel: 'Nueva compañía propia',
    emptyTitle: 'Todavía no hay compañías propias',
    emptyHint: 'Creá una por cada país donde operes con flota propia.',
    intro:
      'Acá administrás recursos internos: los conductores están en nómina y el costo del viaje se ' +
      'arma con la estructura de costos detallada de la compañía (combustible, depreciación, ' +
      'salarios, mantenimiento). No se factura contra un tercero.',
  },
  OUTSOURCED: {
    title: 'Transportistas a Liquidar',
    subtitle: 'Terceros contratados a los que se les paga el viaje',
    icon: 'ri-truck-line',
    newLabel: 'Nuevo transportista',
    emptyTitle: 'Todavía no hay transportistas cargados',
    emptyHint: 'Cargá los terceros a los que les liquidás viajes.',
    intro:
      'Acá solo hace falta con qué cobrarle al tercero: identificación fiscal y sus condiciones de ' +
      'cobro. No lleva costos internos ni nómina — eso es de la flota propia.',
  },
};

export default function CompaniasView({ classification }: { classification: PartyClassification }) {
  const copy = COPY[classification];
  const isOutsourced = classification === 'OUTSOURCED';

  const { appUser } = useAuth();
  const usuarioActivo = appUser?.full_name || appUser?.email || 'Usuario simulado';
  const rolActivo = obtenerRolActivo();

  const {
    countries, country: activeCountry, countryId, loading: loadingCountries, setCountry,
  } = useActiveCountry();

  const [parties, setParties] = useState<SettlementPartyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<SettlementPartyRow | null>(null);
  const [variablesFor, setVariablesFor] = useState<SettlementPartyRow | null>(null);
  const [costsFor, setCostsFor] = useState<SettlementPartyRow | null>(null);
  const [vehiclesFor, setVehiclesFor] = useState<SettlementPartyRow | null>(null);
  const [routesFor, setRoutesFor] = useState<SettlementPartyRow | null>(null);
  const [ratesFor, setRatesFor] = useState<SettlementPartyRow | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setParties(await listParties({ classification, includeInactive: true }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [classification]);

  useEffect(() => { void load(); }, [load]);

  const countriesById = useMemo(
    () => new Map(countries.map((c) => [c.id, c])),
    [countries],
  );

  const currency = activeCountry?.local_currency ?? 'moneda local';

  // Las zonas del país activo, para que el tarifario pueda sugerir códigos en sus columnas.
  const zonasDelPais = useMemo(
    () => loadZones(activeCountry?.id).map((z) => ({ id: z.id, code: z.code, name: z.name })),
    [activeCountry?.id],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return parties.filter((p) => {
      if (!showInactive && p.status !== 'active') return false;
      // Acotado al país activo: el ámbito del módulo es global.
      if (p.country_id !== countryId) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.code.toLowerCase().includes(term) ||
        (p.tax_id ?? '').toLowerCase().includes(term)
      );
    });
  }, [parties, search, countryId, showInactive]);

  const handleSaved = async (party: SettlementPartyRow, wasNew: boolean) => {
    await registrarEvento({
      entidad: 'settlement_party',
      entidadId: party.id,
      accion: wasNew ? 'CREATE' : 'UPDATE',
      usuario: usuarioActivo,
      rol: rolActivo,
      despues: party,
    });
    setIsModalOpen(false);
    setSelected(null);
    await load();
  };

  const handleToggleStatus = async (party: SettlementPartyRow) => {
    setActionError('');
    const reactivating = party.status !== 'active';

    if (!reactivating) {
      const dependientes = await countOutsourcedRates(party.id);
      const aviso = dependientes > 0
        ? `\n\nOjo: ${dependientes} tarifa(s) de outsourcing dependen de esta compañía y dejarán de ofrecerse.`
        : '';
      const ok = window.confirm(
        `¿Desactivar "${party.name}"?\n\nNo se borra: sale de los selectores pero las liquidaciones ` +
        `ya emitidas la conservan intacta, porque el histórico es inmutable.${aviso}`,
      );
      if (!ok) return;
    }

    const result = reactivating ? await reactivateParty(party.id) : await deactivateParty(party.id);
    if (result.error) {
      setActionError(result.error.message);
      return;
    }

    await registrarEvento({
      entidad: 'settlement_party',
      entidadId: party.id,
      accion: 'UPDATE',
      usuario: usuarioActivo,
      rol: rolActivo,
      antes: { status: party.status },
      despues: { status: reactivating ? 'active' : 'inactive' },
      motivo: reactivating ? 'Reactivación' : 'Baja lógica',
    });
    await load();
  };

  const puedeCrear = puede('CREAR_COMPANIA', rolActivo);
  const puedeEditar = puede('EDITAR_COMPANIA', rolActivo);
  const puedeDesactivar = puede('DESACTIVAR_COMPANIA', rolActivo);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
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
        <Button
          onClick={() => { setSelected(null); setIsModalOpen(true); }}
          disabled={!puedeCrear || countries.length === 0}
          title={!puedeCrear ? 'Tu rol simulado actual no puede crear compañías' : undefined}
        >
          <i className="ri-add-line mr-2"></i>
          {copy.newLabel}
        </Button>
      </div>

      <CountryScopeBar
        countries={countries}
        country={activeCountry}
        onChange={setCountry}
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
        <div className="flex flex-col md:flex-row md:items-end gap-4 mb-5">
          <div className="flex-1">
            <Input
              label="Buscar"
              icon="ri-search-line"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, código o identificación fiscal"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Ver desactivadas
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Cargando…</p>
        ) : visible.length === 0 ? (
          <div className="text-center py-12">
            <i className={`${copy.icon} text-4xl text-slate-300`}></i>
            <p className="mt-3 text-slate-600 font-medium">{copy.emptyTitle}</p>
            <p className="text-sm text-slate-500">{copy.emptyHint}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500 uppercase">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Nombre</th>
                  {isOutsourced && <th className="px-4 py-3">Identificación fiscal</th>}
                  <th className="px-4 py-3">País / Moneda</th>
                  {isOutsourced && <th className="px-4 py-3">Enlace TMS</th>}
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((party) => {
                  const country = countriesById.get(party.country_id);
                  const inactive = party.status !== 'active';
                  return (
                    <tr key={party.id} className={inactive ? 'bg-slate-50/60' : ''}>
                      <td className="px-4 py-3 text-sm font-mono text-slate-600">{party.code}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-800">{party.name}</div>
                        {party.contact_name && (
                          <div className="text-xs text-slate-500">{party.contact_name}</div>
                        )}
                      </td>
                      {isOutsourced && (
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {party.tax_id
                            ? <>{party.tax_id} <span className="text-xs text-slate-400">({party.tax_id_type})</span></>
                            : <span className="text-amber-600 text-xs">Falta — no se le puede liquidar</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {country ? (
                          <>
                            {country.name}{' '}
                            <span className="text-xs text-slate-400">({country.local_currency})</span>
                          </>
                        ) : (
                          <span className="text-red-600 text-xs">País no configurado</span>
                        )}
                      </td>
                      {isOutsourced && (
                        <td className="px-4 py-3 text-sm">
                          {party.carrier_id
                            ? <Badge variant="success" size="sm">Enlazado</Badge>
                            : <span className="text-xs text-slate-400">Sin enlazar</span>}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <Badge variant={inactive ? 'default' : 'success'} size="sm">
                          {inactive ? 'Desactivada' : 'Activa'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSelected(party); setIsModalOpen(true); }}
                            disabled={!puedeEditar}
                            title={!puedeEditar ? 'Tu rol simulado actual no puede editar compañías' : 'Editar'}
                          >
                            <i className="ri-edit-line"></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCostsFor(party)}
                            title="Estructura de costos de esta compañía"
                          >
                            <i className="ri-table-line"></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVehiclesFor(party)}
                            title="Vehículos y su capacidad"
                          >
                            <i className="ri-truck-line"></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRoutesFor(party)}
                            title="Rutas que cubre esta compañía"
                          >
                            <i className="ri-route-line"></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRatesFor(party)}
                            title="Tarifarios: el precio de cada ruta"
                          >
                            <i className="ri-price-tag-3-line"></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVariablesFor(party)}
                            title="Variables propias de esta compañía"
                          >
                            <i className="ri-code-box-line"></i>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleToggleStatus(party)}
                            disabled={!puedeDesactivar}
                            title={inactive ? 'Reactivar' : 'Desactivar'}
                          >
                            <i className={inactive ? 'ri-refresh-line' : 'ri-forbid-line'}></i>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CompaniaModal
        isOpen={isModalOpen}
        classification={classification}
        party={selected}
        countries={countries}
        existing={parties}
        onClose={() => { setIsModalOpen(false); setSelected(null); }}
        onSaved={handleSaved}
      />

      <VariablesModal
        isOpen={!!variablesFor}
        party={variablesFor}
        onClose={() => setVariablesFor(null)}
      />

      <VehicleTypesModal
        isOpen={!!vehiclesFor}
        party={vehiclesFor}
        onClose={() => setVehiclesFor(null)}
      />

      <RoutesModal
        isOpen={!!routesFor}
        party={routesFor}
        onClose={() => setRoutesFor(null)}
      />

      <RateTablesModal
        isOpen={!!ratesFor}
        party={ratesFor}
        currency={currency}
        zones={zonasDelPais}
        onClose={() => setRatesFor(null)}
      />

      <CostStructureModal
        isOpen={!!costsFor}
        party={costsFor}
        currency={currency}
        onClose={() => setCostsFor(null)}
      />
    </div>
  );
}
