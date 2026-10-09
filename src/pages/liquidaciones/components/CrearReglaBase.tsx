import { useAuth } from '../../../hooks/useAuth';
import RuleModal from '../../reglas-tarifa/components/RuleModal';
import type { BASE_RULE_TEMPLATES } from '../../../lib/tarifas/baseMethods';
import type { TripCalculation } from '../../../lib/tarifas/tripSettlement';

/** Formulario de reglas precargado para una regla BASE. Solo se monta para administradores. */
export default function CrearReglaBase({ isOpen, onClose, onCreated, calculation, template }: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  calculation: TripCalculation;
  template: (typeof BASE_RULE_TEMPLATES)[keyof typeof BASE_RULE_TEMPLATES] | null;
}) {
  const { appUser } = useAuth();
  const { country } = calculation.input;
  return (
    <RuleModal
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onCreated}
      organizationId={appUser?.organization_id || ''}
      country={{ id: country.id, name: country.name, local_currency: country.localCurrency }}
      usuarioActivo={appUser?.full_name || appUser?.email || 'Usuario'}
      defaults={{
        stage: 'BASE',
        partyId: calculation.partyId,
        ...(template ? { operator: template.operator, variable: template.variable } : {}),
      }}
    />
  );
}
