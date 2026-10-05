import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import DataTable, { type DataTableColumn } from '../../components/base/DataTable';
import RuleModal from './components/RuleModal';
import ZoneGroupModal from './components/ZoneGroupModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import RuleTester from './components/RuleTester';
import PlantillasTab from './components/PlantillasTab';
import ResumenTab from './components/ResumenTab';
import TarifariosTab from './components/TarifariosTab';
import CostosTab from './components/CostosTab';
import MargenPolicyTab from './components/MargenPolicyTab';
import CountrySettingsCard from './components/CountrySettingsCard';
import BitacoraTab from './components/BitacoraTab';
import HelpButton from './components/HelpButton';
import {
  deleteRule, deleteZoneGroup, listRules, listZoneGroups, listZones,
} from '../../lib/tarifas/localRulesDataSource';
import { getActorRole } from '../../lib/tarifas/actor';
import { useTarifasActor } from '../../hooks/useTarifasActor';
import { registrarEvento } from '../../lib/liquidador/auditLog';
import { listCarrierProfiles } from '../../lib/tarifas/partiesDataSource';
import CountryScopeBar from '../../components/feature/CountryScopeBar';
import DataModeBanner from '../../components/tarifas/DataModeBanner';
import { useActiveCountry } from '../../hooks/useActiveCountry';
import type { CarrierProfile } from '../../lib/tarifas/parties';
import { useModulePermissions } from '../../hooks/use-module-permissions';

type Tab = 'reglas' | 'zonas' | 'tarifarios' | 'costos' | 'margen' | 'plantillas' | 'resumen' | 'probador' | 'bitacora';

export default function ReglasTarifaPage() {
  const { appUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('reglas');
  const usuarioActivo = appUser?.full_name || appUser?.email || 'Usuario';
  // Permisos reales del módulo de configuración (el backend los exige igual).
  const { canCreate, canEdit, canDelete } = useModulePermissions('tarifas.config');
  useTarifasActor();

  // País activo: el ámbito global del módulo. Reemplaza a los selectores que tenía cada pestaña.
  const { countries, country: activeCountry, countryId, problem, selectedName, loading: loadingCountries } = useActiveCountry();

  // --- Reglas ---
  const [rules, setRules] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<any>(null);
  // Enlace desde el desglose de una liquidación: /reglas-tarifa?regla=<id> abre esa regla.
  const [searchParams, setSearchParams] = useSearchParams();
  const ruleFromLink = searchParams.get('regla');
  const [ruleToDelete, setRuleToDelete] = useState<any>(null);
  const [ruleDeleteError, setRuleDeleteError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [parties, setParties] = useState<CarrierProfile[]>([]);

  useEffect(() => {
    if (!ruleFromLink || rules.length === 0) return;
    const found = rules.find((r) => r.id === ruleFromLink);
    if (found) { setActiveTab('reglas'); setSelectedRule(found); setIsRuleModalOpen(true); }
    setSearchParams({}, { replace: true });
  }, [ruleFromLink, rules, setSearchParams]);

  // --- Zonas ---
  const [zones, setZones] = useState<any[]>([]);
  const [zoneGroups, setZoneGroups] = useState<any[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [groupToDelete, setGroupToDelete] = useState<any>(null);
  const [groupDeleteError, setGroupDeleteError] = useState('');

  useEffect(() => {
    if (appUser?.organization_id) {
      loadRules();
      loadZones();
      loadZoneGroups();
    }
  }, [appUser?.organization_id]);

  const loadRules = async () => {
    try {
      setLoadingRules(true);
      setLoadError('');
      setParties(await listCarrierProfiles({ includeInactive: true }));
      setRules(await listRules(appUser?.organization_id || ''));
    } catch (error) {
      console.error('Error cargando reglas:', error);
      setLoadError('No se pudieron cargar las reglas. Reintentá en unos segundos.');
    } finally {
      setLoadingRules(false);
    }
  };

  const loadZones = async () => {
    try {
      setLoadingZones(true);
      setLoadError('');
      setZones(await listZones(appUser?.organization_id || ''));
    } catch (error) {
      console.error('Error cargando zonas:', error);
      setLoadError('No se pudieron cargar las zonas. Reintentá en unos segundos.');
    } finally {
      setLoadingZones(false);
    }
  };

  const loadZoneGroups = async () => {
    try {
      setZoneGroups(await listZoneGroups(appUser?.organization_id || ''));
    } catch (error) {
      console.error('Error cargando grupos de zonas:', error);
      setLoadError('No se pudieron cargar los grupos de zonas. Reintentá en unos segundos.');
    }
  };

  const handleDeleteRule = async () => {
    if (!ruleToDelete) return;
    setRuleDeleteError('');
    if (!canDelete) {
      setRuleDeleteError('Tu rol no tiene permiso para eliminar reglas.');
      return;
    }
    try {
      const { error } = await deleteRule(ruleToDelete.id);
      if (error) {
        if (error.code === '23503') {
          setRuleDeleteError('No se puede eliminar: esta regla está referenciada en liquidaciones existentes.');
          return;
        }
        throw error;
      }
      await registrarEvento({
        entidad: 'pricing_rules', entidadId: ruleToDelete.id, accion: 'DELETE',
        usuario: usuarioActivo, rol: getActorRole(), antes: ruleToDelete, despues: null,
      });
      await loadRules();
      setRuleToDelete(null);
    } catch (error) {
      console.error('Error al eliminar regla:', error);
      setRuleDeleteError('Ocurrió un error inesperado al intentar eliminar la regla.');
    }
  };

  const handleDeleteGroup = async () => {
    if (!groupToDelete) return;
    setGroupDeleteError('');
    if (!canDelete) {
      setGroupDeleteError('Tu rol no tiene permiso para eliminar grupos de zonas.');
      return;
    }
    try {
      const { error } = await deleteZoneGroup(groupToDelete.id);
      if (error) {
        setGroupDeleteError(`No se pudo eliminar el grupo: ${error.message}`);
        return;
      }
      await registrarEvento({
        entidad: 'zone_groups', entidadId: groupToDelete.id, accion: 'DELETE',
        usuario: usuarioActivo, rol: getActorRole(), antes: groupToDelete, despues: null,
      });
      await loadZoneGroups();
      await loadZones();
      setGroupToDelete(null);
    } catch (error) {
      console.error('Error al eliminar grupo de zonas:', error);
      setGroupDeleteError('Ocurrió un error inesperado al intentar eliminar el grupo.');
    }
  };

  const partyName = (id: string | null) => parties.find((p) => p.partyId === id)?.name ?? id ?? '';

  // Acotado al país activo. Las reglas SIN país son globales: aplican también acá, así que se
  // muestran — esconderlas daría una lista incompleta de lo que va a correr al liquidar.
  const countryRules = rules.filter((r) => !r.country_id || r.country_id === countryId);
  const countryZones = zones.filter((z) => z.country_id === countryId);
  const countryZoneGroups = zoneGroups.filter((g) => g.country_id === countryId);

  // Códigos de país que alguna compañía sobrescribe: sirve para marcar en la lista la regla de país
  // que quedó reemplazada y la de compañía que la reemplaza.
  const overriddenCountryCodes = new Set(
    countryRules.filter((r) => r.scope === 'PARTY').map((r) => r.code),
  );

  const stackingBadge = (stacking: string) => {
    const variant = stacking === 'EXCLUSIVE' ? 'warning' : stacking === 'MAX' ? 'info' : 'default';
    return <Badge variant={variant}>{stacking}</Badge>;
  };

  // Vigencia contra HOY, que es distinto de la vigencia que usa el motor (esa se mide contra la
  // fecha del viaje). Acá solo sirve para que se vea de un vistazo cuál ya venció y cuál todavía no
  // empezó — una regla vencida sigue liquidando correctamente los viajes de su período.
  const vigenciaBadge = (rule: any) => {
    const desde: string | null = rule.effective_from || null;
    const hasta: string | null = rule.effective_to || null;
    if (!desde && !hasta) return <span className="text-xs text-slate-400">Sin límite</span>;

    const hoy = new Date().toISOString().slice(0, 10);
    const estado = hasta && hoy > hasta ? 'vencida' : desde && hoy < desde ? 'futura' : 'vigente';

    return (
      <div className="flex flex-col items-start gap-0.5">
        <Badge variant={estado === 'vigente' ? 'success' : estado === 'vencida' ? 'default' : 'info'}>
          {estado === 'vigente' ? 'Vigente' : estado === 'vencida' ? 'Vencida' : 'Futura'}
        </Badge>
        <span className="text-[11px] text-slate-500 whitespace-nowrap">
          {desde ?? '…'} → {hasta ?? '…'}
        </span>
      </div>
    );
  };

  // Tres estados posibles, que es todo lo que el modelo de alcance permite:
  // - de país y nadie la pisa  -> la heredan todas las compañías
  // - de país y alguien la pisa -> sigue valiendo para el resto, pero no para esa compañía
  // - de compañía              -> propia, o sobrescribe la de país con el mismo código
  const scopeBadge = (rule: any) => {
    if (rule.scope !== 'PARTY') {
      return overriddenCountryCodes.has(rule.code)
        ? <Badge variant="warning">Heredada (sobrescrita)</Badge>
        : <Badge variant="default">Heredada</Badge>;
    }
    const sobrescribe = rules.some((r) => r.scope !== 'PARTY' && r.code === rule.code);
    return (
      <div className="flex flex-col items-start gap-0.5">
        <Badge variant={sobrescribe ? 'warning' : 'info'}>
          {sobrescribe ? 'Sobrescribe' : 'Propia'}
        </Badge>
        <span className="text-[11px] text-slate-500">{partyName(rule.party_id)}</span>
      </div>
    );
  };

  const vigenciaEstado = (rule: any) => {
    const desde: string | null = rule.effective_from || null;
    const hasta: string | null = rule.effective_to || null;
    if (!desde && !hasta) return 'Sin límite';
    const hoy = new Date().toISOString().slice(0, 10);
    return hasta && hoy > hasta ? 'Vencida' : desde && hoy < desde ? 'Futura' : 'Vigente';
  };

  const ruleColumns: DataTableColumn<any>[] = [
    {
      key: 'code', header: 'Código', accessor: (r) => r.code, sortable: true,
      render: (r) => <span className="font-mono text-sm text-teal-700">{r.code}</span>,
    },
    {
      key: 'name', header: 'Nombre', accessor: (r) => r.name, sortable: true,
      render: (r) => (
        <div>
          <div>{r.name}</div>
          {r.description && <div className="text-xs text-slate-500 mt-0.5 max-w-md">{r.description}</div>}
          {r.reason && <div className="text-[11px] text-slate-400 mt-0.5 italic">Motivo: {r.reason}</div>}
        </div>
      ),
      exportValue: (r) => r.name ?? '',
    },
    {
      key: 'scope', header: 'Alcance', sortable: true, filterable: true,
      accessor: (r) => (r.scope === 'PARTY' ? partyName(r.party_id) : 'Todo el país'),
      render: (r) => scopeBadge(r),
    },
    { key: 'stage', header: 'Etapa', accessor: (r) => r.stage, sortable: true, filterable: true },
    {
      key: 'stacking', header: 'Competencia', accessor: (r) => r.stacking, sortable: true, filterable: true,
      render: (r) => stackingBadge(r.stacking),
    },
    { key: 'priority', header: 'Prioridad', accessor: (r) => r.priority, sortable: true },
    {
      key: 'vigencia', header: 'Vigencia', accessor: (r) => vigenciaEstado(r), sortable: true, filterable: true,
      render: (r) => vigenciaBadge(r),
    },
    {
      key: 'active', header: 'Estado', accessor: (r) => (r.active ? 'Activa' : 'Inactiva'), sortable: true, filterable: true,
      render: (r) => <Badge variant={r.active ? 'success' : 'default'}>{r.active ? 'Activa' : 'Inactiva'}</Badge>,
    },
  ];

  const zoneColumns: DataTableColumn<any>[] = [
    {
      key: 'code', header: 'Código', accessor: (z) => z.code, sortable: true,
      render: (z) => <span className="font-mono text-sm text-teal-700">{z.code}</span>,
    },
    { key: 'name', header: 'Nombre', accessor: (z) => z.name, sortable: true },
    { key: 'group', header: 'Grupo', accessor: (z) => z.zone_groups?.name || '—', sortable: true, filterable: true },
    { key: 'country', header: 'País', accessor: (z) => z.countries?.name || '—', sortable: true },
    {
      key: 'status', header: 'Estado', accessor: (z) => (z.status === 'active' ? 'Activa' : 'Inactiva'), sortable: true, filterable: true,
      render: (z) => <Badge variant={z.status === 'active' ? 'success' : 'default'}>{z.status === 'active' ? 'Activa' : 'Inactiva'}</Badge>,
    },
  ];

  const groupColumns: DataTableColumn<any>[] = [
    {
      key: 'code', header: 'Código', accessor: (g) => g.code, sortable: true,
      render: (g) => <span className="font-mono text-sm text-teal-700">{g.code}</span>,
    },
    { key: 'name', header: 'Nombre', accessor: (g) => g.name, sortable: true },
    {
      key: 'zones', header: 'Zonas', accessor: (g) => (g.zone_codes ?? []).join(', '),
      render: (g) => <span className="font-mono text-xs text-slate-600">{(g.zone_codes ?? []).join(', ') || '—'}</span>,
    },
    { key: 'count', header: 'Cantidad', align: 'right', accessor: (g) => (g.zone_codes ?? []).length, sortable: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">Reglas de Tarifa</h1>
            <HelpButton
              title="¿Qué es esto?"
              steps={[
                'Reglas: definen cómo se calcula lo que se le cobra al transportista/cliente por una liquidación (base, por km, recargos, descuentos).',
                'Zonas: son del catálogo (solo lectura). Acá se agrupan en grupos de zonas para condicionar reglas y tarifas por "de dónde a dónde" sin declarar una regla por cada zona.',
                'Costos y Margen: cuánto le cuesta a la empresa ese viaje (flota propia o transportista) y qué tan buen negocio fue, comparado contra lo cobrado.',
                'Plantillas: viajes frecuentes guardados para no tipear los mismos datos cada vez en el Probador.',
                'Resumen: una vista de solo lectura con todo lo configurado, para auditar de un vistazo.',
                'Probador del motor: corré un viaje de prueba con los datos de arriba y mirá el desglose completo antes de usarlo en una liquidación real.',
              ]}
            />
          </div>
          <p className="text-sm text-slate-500 mt-1">Reglas de liquidación al transportista configurables y zonas para liquidaciones</p>
        </div>
        <div className="flex items-center gap-3">
          {canCreate && activeTab === 'reglas' && (
            <Button
              onClick={() => { setSelectedRule(null); setIsRuleModalOpen(true); }}
            >
              <i className="ri-add-line mr-2"></i>
              Nueva Regla
            </Button>
          )}
          {canCreate && activeTab === 'zonas' && (
            <Button
              onClick={() => { setSelectedGroup(null); setIsGroupModalOpen(true); }}
            >
              <i className="ri-add-line mr-2"></i>
              Nuevo Grupo de Zonas
            </Button>
          )}
        </div>
      </div>

      <DataModeBanner />
      <CountryScopeBar
        country={activeCountry}
        problem={problem}
        selectedName={selectedName}
        loading={loadingCountries}
      />

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('reglas')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'reglas' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Reglas
        </button>
        <button
          onClick={() => setActiveTab('zonas')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'zonas' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Zonas
        </button>
        <button
          onClick={() => setActiveTab('tarifarios')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'tarifarios' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Tarifarios
        </button>
        <button
          onClick={() => setActiveTab('costos')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'costos' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Costos
        </button>
        <button
          onClick={() => setActiveTab('margen')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'margen' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Política de Margen
        </button>
        <button
          onClick={() => setActiveTab('plantillas')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'plantillas' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Plantillas
        </button>
        <button
          onClick={() => setActiveTab('resumen')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'resumen' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Resumen
        </button>
        <button
          onClick={() => setActiveTab('probador')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'probador' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <i className="ri-flask-line mr-1"></i>
          Probador del motor
        </button>
        <button
          onClick={() => setActiveTab('bitacora')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'bitacora' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <i className="ri-history-line mr-1"></i>
          Bitácora
        </button>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
          <span>{loadError}</span>
        </div>
      )}

      {activeTab === 'reglas' && (
        <Card>
          <DataTable
            data={countryRules}
            columns={ruleColumns}
            getRowId={(r) => String(r.id)}
            loading={loadingRules}
            searchPlaceholder="Buscar por código, nombre o compañía..."
            exportFileName="reglas_tarifa"
            emptyMessage="No hay reglas registradas. Creá tu primera regla para empezar a tarifar liquidaciones."
            actions={(rule) => (
              <>
                {canEdit && (
                  <button
                    onClick={() => { setSelectedRule(rule); setIsRuleModalOpen(true); }}
                    className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Editar"
                  >
                    <i className="ri-edit-line text-base"></i>
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => { setRuleToDelete(rule); setRuleDeleteError(''); }}
                    className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Eliminar"
                  >
                    <i className="ri-delete-bin-line text-base"></i>
                  </button>
                )}
              </>
            )}
          />
        </Card>
      )}

      {activeTab === 'zonas' && (
        <div className="space-y-6">
          <Card>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Zonas</h3>
            <p className="text-xs text-slate-500 mb-3">
              Las zonas son del catálogo y son de solo lectura: se crean y editan en Catálogos.
            </p>
            <DataTable
              data={countryZones}
              columns={zoneColumns}
              getRowId={(z) => String(z.id)}
              loading={loadingZones}
              searchPlaceholder="Buscar zona..."
              exportFileName="zonas"
              emptyMessage="No hay zonas registradas en este país. Se dan de alta en Catálogos."
            />
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Grupos de zonas</h3>
            <p className="text-xs text-slate-500 mb-3">
              Lo que se edita acá: qué zonas forman cada grupo. Una zona solo puede estar en un grupo por país.
            </p>
            <DataTable
              data={countryZoneGroups}
              columns={groupColumns}
              getRowId={(g) => String(g.id)}
              loading={loadingZones}
              searchPlaceholder="Buscar grupo..."
              exportFileName="grupos_de_zonas"
              emptyMessage="No hay grupos de zonas en este país."
              actions={(group) => (
                <>
                  {canEdit && (
                    <button
                      onClick={() => { setSelectedGroup(group); setIsGroupModalOpen(true); }}
                      className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Editar"
                    >
                      <i className="ri-edit-line text-base"></i>
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => { setGroupToDelete(group); setGroupDeleteError(''); }}
                      className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Eliminar"
                    >
                      <i className="ri-delete-bin-line text-base"></i>
                    </button>
                  )}
                </>
              )}
            />
          </Card>
        </div>
      )}

      {activeTab === 'tarifarios' && (
        <TarifariosTab
          countryId={countryId}
          currency={activeCountry?.local_currency}
          zones={countryZones}
        />
      )}

      {activeTab === 'costos' && (
        <CostosTab organizationId={appUser?.organization_id || ''} country={activeCountry} />
      )}

      {activeTab === 'margen' && (
        <div className="space-y-6">
          <MargenPolicyTab organizationId={appUser?.organization_id || ''} countryId={countryId} />
          <CountrySettingsCard countryId={countryId} currency={activeCountry?.local_currency} />
        </div>
      )}

      {activeTab === 'plantillas' && (
        <PlantillasTab organizationId={appUser?.organization_id || ''} countryId={countryId} zones={zones} />
      )}

      {activeTab === 'resumen' && (
        <ResumenTab organizationId={appUser?.organization_id || ''} countryId={countryId} />
      )}

      {activeTab === 'probador' && (
        <RuleTester organizationId={appUser?.organization_id || ''} />
      )}

      {activeTab === 'bitacora' && <BitacoraTab />}

      <RuleModal
        isOpen={isRuleModalOpen}
        onClose={() => { setIsRuleModalOpen(false); setSelectedRule(null); }}
        onSuccess={loadRules}
        rule={selectedRule}
        organizationId={appUser?.organization_id || ''}
        country={activeCountry}
        usuarioActivo={usuarioActivo}
      />

      <ZoneGroupModal
        isOpen={isGroupModalOpen}
        onClose={() => { setIsGroupModalOpen(false); setSelectedGroup(null); }}
        onSuccess={() => { void loadZoneGroups(); void loadZones(); }}
        group={selectedGroup}
        organizationId={appUser?.organization_id || ''}
        countryId={countryId}
        zones={countryZones}
        usuarioActivo={usuarioActivo}
      />

      <DeleteConfirmModal
        isOpen={!!ruleToDelete}
        onClose={() => setRuleToDelete(null)}
        onConfirm={handleDeleteRule}
        title="Eliminar regla"
        description={`¿Seguro que querés eliminar la regla "${ruleToDelete?.code}"? Esta acción no se puede deshacer.`}
        errorMessage={ruleDeleteError}
      />

      <DeleteConfirmModal
        isOpen={!!groupToDelete}
        onClose={() => setGroupToDelete(null)}
        onConfirm={handleDeleteGroup}
        title="Eliminar grupo de zonas"
        description={`¿Seguro que querés eliminar el grupo "${groupToDelete?.code}"? Las zonas siguen existiendo en el catálogo; solo dejan de estar agrupadas.`}
        errorMessage={groupDeleteError}
      />
    </div>
  );
}
