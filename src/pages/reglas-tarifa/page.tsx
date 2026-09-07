import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Badge from '../../components/base/Badge';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import RuleModal from './components/RuleModal';
import ZoneModal from './components/ZoneModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import RuleTester from './components/RuleTester';
import PlantillasTab from './components/PlantillasTab';
import ResumenTab from './components/ResumenTab';
import ZoneLaneRatesSection from './components/ZoneLaneRatesSection';
import FxRatesSection from './components/FxRatesSection';
import BitacoraTab from './components/BitacoraTab';
import HelpButton from './components/HelpButton';
import {
  deleteRule, deleteZone, listCountries, listRules, listZoneGroups, listZones,
} from '../../lib/tarifas/rulesDataSource';
import { LIQUIDADOR_ROLES, obtenerRolActivo, establecerRolActivo, puede } from '../../lib/liquidador/rbac';
import type { LiquidadorRole } from '../../lib/liquidador/rbac';
import { registrarEvento } from '../../lib/liquidador/auditLog';

type Tab = 'reglas' | 'zonas' | 'plantillas' | 'resumen' | 'probador' | 'bitacora';

export default function ReglasTarifaPage() {
  const { appUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('reglas');
  const [rolActivo, setRolActivo] = useState<LiquidadorRole>(obtenerRolActivo());
  const usuarioActivo = appUser?.full_name || appUser?.email || 'Usuario simulado';

  const handleRolChange = (rol: LiquidadorRole) => {
    setRolActivo(rol);
    establecerRolActivo(rol);
  };

  const [countries, setCountries] = useState<any[]>([]);

  // --- Reglas ---
  const [rules, setRules] = useState<any[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<any>(null);
  const [ruleToDelete, setRuleToDelete] = useState<any>(null);
  const [ruleDeleteError, setRuleDeleteError] = useState('');
  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleStageFilter, setRuleStageFilter] = useState('all');

  // --- Zonas ---
  const [zones, setZones] = useState<any[]>([]);
  const [zoneGroups, setZoneGroups] = useState<any[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState<any>(null);
  const [zoneToDelete, setZoneToDelete] = useState<any>(null);
  const [zoneDeleteError, setZoneDeleteError] = useState('');

  useEffect(() => {
    if (appUser?.organization_id) {
      loadCountries();
      loadRules();
      loadZones();
      loadZoneGroups();
    }
  }, [appUser?.organization_id]);

  const loadCountries = async () => {
    setCountries(await listCountries(appUser?.organization_id || ''));
  };

  const loadRules = async () => {
    try {
      setLoadingRules(true);
      setRules(await listRules(appUser?.organization_id || ''));
    } catch (error) {
      console.error('Error cargando reglas:', error);
    } finally {
      setLoadingRules(false);
    }
  };

  const loadZones = async () => {
    try {
      setLoadingZones(true);
      setZones(await listZones(appUser?.organization_id || ''));
    } catch (error) {
      console.error('Error cargando zonas:', error);
    } finally {
      setLoadingZones(false);
    }
  };

  const loadZoneGroups = async () => {
    setZoneGroups(await listZoneGroups(appUser?.organization_id || ''));
  };

  const handleDeleteRule = async () => {
    if (!ruleToDelete) return;
    setRuleDeleteError('');
    if (!puede('ELIMINAR_REGLA', rolActivo)) {
      setRuleDeleteError('Tu rol simulado actual no tiene permiso para eliminar reglas.');
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
        usuario: usuarioActivo, rol: rolActivo, antes: ruleToDelete, despues: null,
      });
      await loadRules();
      setRuleToDelete(null);
    } catch (error) {
      console.error('Error al eliminar regla:', error);
      setRuleDeleteError('Ocurrió un error inesperado al intentar eliminar la regla.');
    }
  };

  const handleDeleteZone = async () => {
    if (!zoneToDelete) return;
    setZoneDeleteError('');
    if (!puede('ELIMINAR_ZONA', rolActivo)) {
      setZoneDeleteError('Tu rol simulado actual no tiene permiso para eliminar zonas.');
      return;
    }
    try {
      const { error } = await deleteZone(zoneToDelete.id);
      if (error) {
        if (error.code === '23503') {
          setZoneDeleteError('No se puede eliminar esta zona porque está en uso (tipos de ruta, tiendas o tarifas por zona). Primero reasigna esos registros.');
          return;
        }
        throw error;
      }
      await registrarEvento({
        entidad: 'zones', entidadId: zoneToDelete.id, accion: 'DELETE',
        usuario: usuarioActivo, rol: rolActivo, antes: zoneToDelete, despues: null,
      });
      await loadZones();
      setZoneToDelete(null);
    } catch (error) {
      console.error('Error al eliminar zona:', error);
      setZoneDeleteError('Ocurrió un error inesperado al intentar eliminar la zona.');
    }
  };

  const filteredRules = rules.filter((r) => {
    const matchesSearch = !ruleSearch
      || r.code?.toLowerCase().includes(ruleSearch.toLowerCase())
      || r.name?.toLowerCase().includes(ruleSearch.toLowerCase());
    const matchesStage = ruleStageFilter === 'all' || r.stage === ruleStageFilter;
    return matchesSearch && matchesStage;
  });

  const stackingBadge = (stacking: string) => {
    const variant = stacking === 'EXCLUSIVE' ? 'warning' : stacking === 'MAX' ? 'info' : 'default';
    return <Badge variant={variant}>{stacking}</Badge>;
  };

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
                'Zonas: agrupan tiendas/tipos de ruta para poder condicionar reglas y tarifas por "de dónde a dónde" sin declarar una regla por cada ruta puntual.',
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
          <div className="text-sm">
            <label className="block text-xs text-slate-500 mb-0.5">Actuando como</label>
            <select
              value={rolActivo}
              onChange={(e) => handleRolChange(e.target.value as LiquidadorRole)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {LIQUIDADOR_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          {activeTab === 'reglas' && (
            <Button
              onClick={() => { setSelectedRule(null); setIsRuleModalOpen(true); }}
              disabled={!puede('CREAR_REGLA', rolActivo)}
              title={!puede('CREAR_REGLA', rolActivo) ? 'Tu rol simulado actual no puede crear reglas' : undefined}
            >
              <i className="ri-add-line mr-2"></i>
              Nueva Regla
            </Button>
          )}
          {activeTab === 'zonas' && (
            <Button
              onClick={() => { setSelectedZone(null); setIsZoneModalOpen(true); }}
              disabled={!puede('CREAR_ZONA', rolActivo)}
              title={!puede('CREAR_ZONA', rolActivo) ? 'Tu rol simulado actual no puede crear zonas' : undefined}
            >
              <i className="ri-add-line mr-2"></i>
              Nueva Zona
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
        <i className="ri-shield-user-line mt-0.5 shrink-0"></i>
        <span>
          <strong>Simulación de rol, no es control de acceso real:</strong> el selector "Actuando
          como" solo condiciona qué botones ves habilitados en esta pantalla — no hay backend que lo
          haga cumplir todavía. Cualquiera puede saltárselo abriendo las devtools.
        </span>
      </div>

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

      {activeTab === 'reglas' && (
        <Card>
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Input placeholder="Buscar por código o nombre..." value={ruleSearch} onChange={(e) => setRuleSearch(e.target.value)} icon="ri-search-line" />
              </div>
              <div className="w-56">
                <Select
                  value={ruleStageFilter}
                  onChange={(e) => setRuleStageFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'Todas las etapas' },
                    { value: 'BASE', label: 'Base' },
                    { value: 'VARIABLE', label: 'Variable' },
                    { value: 'MODIFIER', label: 'Modificador' },
                    { value: 'SURCHARGE', label: 'Recargo' },
                    { value: 'ADJUSTMENT', label: 'Ajuste' },
                    { value: 'TAX', label: 'Impuesto' },
                  ]}
                />
              </div>
            </div>

            {loadingRules ? (
              <div className="text-center py-14 text-slate-500">
                <i className="ri-loader-4-line animate-spin text-2xl"></i>
              </div>
            ) : filteredRules.length === 0 ? (
              <div className="text-center py-14">
                <div className="w-16 h-16 flex items-center justify-center bg-slate-100 rounded-full mx-auto mb-4">
                  <i className="ri-price-tag-3-line text-2xl text-slate-400"></i>
                </div>
                <h3 className="text-lg font-medium text-slate-700 mb-1">
                  {rules.length === 0 ? 'No hay reglas registradas' : 'Sin resultados'}
                </h3>
                <p className="text-sm text-slate-500">Crea tu primera regla para empezar a tarifar liquidaciones</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Código</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Nombre</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Etapa</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Competencia</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Prioridad</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Estado</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRules.map((rule) => (
                      <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono text-sm text-teal-700">{rule.code}</td>
                        <td className="py-3 px-4 text-sm text-slate-800">{rule.name}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{rule.stage}</td>
                        <td className="py-3 px-4">{stackingBadge(rule.stacking)}</td>
                        <td className="py-3 px-4 text-sm text-slate-600">{rule.priority}</td>
                        <td className="py-3 px-4">
                          <Badge variant={rule.active ? 'success' : 'default'}>{rule.active ? 'Activa' : 'Inactiva'}</Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setSelectedRule(rule); setIsRuleModalOpen(true); }}
                              disabled={!puede('EDITAR_REGLA', rolActivo)}
                              className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title={puede('EDITAR_REGLA', rolActivo) ? 'Editar' : 'Tu rol simulado actual no puede editar reglas'}
                            >
                              <i className="ri-edit-line text-base"></i>
                            </button>
                            <button
                              onClick={() => { setRuleToDelete(rule); setRuleDeleteError(''); }}
                              disabled={!puede('ELIMINAR_REGLA', rolActivo)}
                              className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title={puede('ELIMINAR_REGLA', rolActivo) ? 'Eliminar' : 'Tu rol simulado actual no puede eliminar reglas'}
                            >
                              <i className="ri-delete-bin-line text-base"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'zonas' && (
        <div className="space-y-6">
        <Card>
          {loadingZones ? (
            <div className="text-center py-14 text-slate-500">
              <i className="ri-loader-4-line animate-spin text-2xl"></i>
            </div>
          ) : zones.length === 0 ? (
            <div className="text-center py-14">
              <div className="w-16 h-16 flex items-center justify-center bg-slate-100 rounded-full mx-auto mb-4">
                <i className="ri-map-pin-line text-2xl text-slate-400"></i>
              </div>
              <h3 className="text-lg font-medium text-slate-700 mb-1">No hay zonas registradas</h3>
              <p className="text-sm text-slate-500">
                Crea zonas y asígnalas a Tipos de Ruta (destino) y Puntos de Entrega de origen (bodegas) para usarlas en reglas.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Código</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Nombre</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Grupo</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">País</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Estado</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((zone) => (
                    <tr key={zone.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono text-sm text-teal-700">{zone.code}</td>
                      <td className="py-3 px-4 text-sm text-slate-800">{zone.name}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{zone.zone_groups?.name || '—'}</td>
                      <td className="py-3 px-4 text-sm text-slate-600">{zone.countries?.name || '—'}</td>
                      <td className="py-3 px-4">
                        <Badge variant={zone.status === 'active' ? 'success' : 'default'}>{zone.status === 'active' ? 'Activa' : 'Inactiva'}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setSelectedZone(zone); setIsZoneModalOpen(true); }}
                            disabled={!puede('EDITAR_ZONA', rolActivo)}
                            className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title={puede('EDITAR_ZONA', rolActivo) ? 'Editar' : 'Tu rol simulado actual no puede editar zonas'}
                          >
                            <i className="ri-edit-line text-base"></i>
                          </button>
                          <button
                            onClick={() => { setZoneToDelete(zone); setZoneDeleteError(''); }}
                            disabled={!puede('ELIMINAR_ZONA', rolActivo)}
                            className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title={puede('ELIMINAR_ZONA', rolActivo) ? 'Eliminar' : 'Tu rol simulado actual no puede eliminar zonas'}
                          >
                            <i className="ri-delete-bin-line text-base"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <ZoneLaneRatesSection organizationId={appUser?.organization_id || ''} zones={zones} />
        <FxRatesSection organizationId={appUser?.organization_id || ''} countries={countries} />
        </div>
      )}

      {activeTab === 'plantillas' && (
        <PlantillasTab organizationId={appUser?.organization_id || ''} countries={countries} zones={zones} />
      )}

      {activeTab === 'resumen' && (
        <ResumenTab organizationId={appUser?.organization_id || ''} countries={countries} zones={zones} />
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
        countries={countries}
        rolActivo={rolActivo}
        usuarioActivo={usuarioActivo}
      />

      <ZoneModal
        isOpen={isZoneModalOpen}
        onClose={() => { setIsZoneModalOpen(false); setSelectedZone(null); }}
        onSuccess={loadZones}
        zone={selectedZone}
        organizationId={appUser?.organization_id || ''}
        countries={countries}
        zoneGroups={zoneGroups}
        rolActivo={rolActivo}
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
        isOpen={!!zoneToDelete}
        onClose={() => setZoneToDelete(null)}
        onConfirm={handleDeleteZone}
        title="Eliminar zona"
        description={`¿Seguro que querés eliminar la zona "${zoneToDelete?.code}"? Esta acción no se puede deshacer.`}
        errorMessage={zoneDeleteError}
      />
    </div>
  );
}
