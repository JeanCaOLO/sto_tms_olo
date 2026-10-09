import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import RuleModal from './components/RuleModal';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import RuleTester from './components/RuleTester';
import TarifariosTab from './components/TarifariosTab';
import MargenPolicyTab from './components/MargenPolicyTab';
import CountrySettingsCard from './components/CountrySettingsCard';
import BitacoraTab from './components/BitacoraTab';
import HelpButton from './components/HelpButton';
import { useTarifasActor } from '../../hooks/useTarifasActor';
import CountryScopeBar from '../../components/feature/CountryScopeBar';
import ViewAsToggle from '../../components/feature/ViewAsToggle';
import { useActiveCountry } from '../../hooks/useActiveCountry';
import { useModulePermissions } from '../../hooks/use-module-permissions';
import { useReglasTarifaController } from './hooks/useReglasTarifaController';
import { RulesSection } from './parts/RulesSection';
import { TabNavigation } from './parts/TabNavigation';

export default function ReglasTarifaPage() {
  const { appUser } = useAuth();
  const { canCreate, canEdit, canDelete } = useModulePermissions('tarifas.config');
  const { countries, country: activeCountry, countryId, problem, selectedName, loading: loadingCountries } = useActiveCountry();
  useTarifasActor();

  const userName = appUser?.full_name || appUser?.email || 'Usuario';
  const organizationId = appUser?.organization_id || '';

  const controller = useReglasTarifaController({
    organizationId,
    countryId,
    userName,
    canDelete,
  });

  const renderHeader = () => (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-800">Reglas Tarifa</h1>
          <HelpButton
            title="¿Qué es esto?"
            steps={[
              'Reglas: definen cómo se calcula lo que se le cobra al transportista/cliente por una liquidación (base, por km, recargos, descuentos).',
              'Probador Motor: corré un viaje de prueba con los datos de arriba y mirá el desglose completo antes de usarlo en una liquidación real.',
            ]}
          />
        </div>
        <p className="text-sm text-slate-500 mt-1">Reglas de liquidación al transportista configurables</p>
      </div>
      <div className="flex items-center gap-3">
        <ViewAsToggle />
        {canCreate && controller.activeTab === 'reglas' && (
          <Button onClick={() => { controller.setSelectedRule(null); controller.setIsRuleModalOpen(true); }}>
            <i className="ri-add-line mr-2"></i>
            Nueva Regla
          </Button>
        )}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (controller.activeTab) {
      case 'reglas':
        return (
          <RulesSection
            rules={controller.rules}
            parties={controller.parties}
            loading={controller.loadingRules}
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDelete}
            onNew={() => { controller.setSelectedRule(null); controller.setIsRuleModalOpen(true); }}
            onEdit={(r) => { controller.setSelectedRule(r); controller.setIsRuleModalOpen(true); }}
            onDelete={(r) => { controller.setRuleToDelete(r); controller.setRuleDeleteError(''); }}
          />
        );
      case 'tarifarios':
        return <TarifariosTab countryId={countryId} currency={activeCountry?.local_currency} zones={controller.zones} />;
      case 'margen':
        return (
          <div className="space-y-6">
            <MargenPolicyTab organizationId={organizationId} countryId={countryId} />
            <CountrySettingsCard countryId={countryId} currency={activeCountry?.local_currency} />
          </div>
        );
      case 'probador':
        return <RuleTester organizationId={organizationId} />;
      case 'bitacora':
        return <BitacoraTab />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {renderHeader()}
      <CountryScopeBar
        country={activeCountry}
        problem={problem}
        selectedName={selectedName}
        loading={loadingCountries}
      />
      <TabNavigation activeTab={controller.activeTab} onTabChange={controller.setActiveTab} />
      {controller.loadError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <i className="ri-error-warning-line mt-0.5 shrink-0"></i>
          <span>{controller.loadError}</span>
        </div>
      )}
      {renderContent()}

      <RuleModal
        isOpen={controller.isRuleModalOpen}
        onClose={() => { controller.setIsRuleModalOpen(false); controller.setSelectedRule(null); }}
        onSuccess={controller.loadRules}
        rule={controller.selectedRule}
        organizationId={organizationId}
        country={activeCountry}
        usuarioActivo={userName}
      />

      <DeleteConfirmModal
        isOpen={!!controller.ruleToDelete}
        onClose={() => controller.setRuleToDelete(null)}
        onConfirm={controller.handleDeleteRule}
        title="Eliminar regla"
        description={`¿Seguro que querés eliminar la regla "${controller.ruleToDelete?.code}"? Esta acción no se puede deshacer.`}
        errorMessage={controller.ruleDeleteError}
        busy={controller.deletingRule}
      />
    </div>
  );
}
