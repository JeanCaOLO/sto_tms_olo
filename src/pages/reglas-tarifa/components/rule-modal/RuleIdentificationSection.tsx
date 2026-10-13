// Sección: identificación básica de la regla.
import Input from '../../../../components/base/Input';
import Select from '../../../../components/base/Select';
import type { Stage } from '../../../../lib/tarifas/types';
import type { CarrierProfile } from '../../../../lib/tarifas/parties';

interface RuleIdentificationSectionProps {
  rule?: Record<string, unknown>;
  code: string;
  name: string;
  scope: 'COUNTRY' | 'PARTY';
  partyId: string;
  selectedCarrierId: string;
  carriers: CarrierProfile[];
  countryId: string;
  onCodeChange: (code: string) => void;
  onNameChange: (name: string) => void;
  onScopeChange: (scope: 'COUNTRY' | 'PARTY') => void;
  onCarrierChange: (carrierId: string) => void;
  onPartyIdChange: (partyId: string) => void;
}

const STAGE_OPTIONS: { value: Stage; label: string }[] = [
  { value: 'BASE', label: 'Base (precio base de la ruta)' },
  { value: 'VARIABLE', label: 'Variable (cliente / kg / bulto)' },
  { value: 'MODIFIER', label: 'Modificador (ajuste por servicio)' },
  { value: 'SURCHARGE', label: 'Recargo (pernocta, peajes y otros variables propios)' },
  { value: 'ADJUSTMENT', label: 'Ajuste (descuentos/penalidades)' },
  { value: 'TAX', label: 'Impuesto' },
];

export default function RuleIdentificationSection({
  rule,
  code,
  name,
  scope,
  partyId,
  selectedCarrierId,
  carriers,
  countryId,
  onCodeChange,
  onNameChange,
  onScopeChange,
  onCarrierChange,
  onPartyIdChange,
}: RuleIdentificationSectionProps) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Identificación</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Código *"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          placeholder="BONO-PEAJES"
          required
          disabled={!!rule}
        />
        <Input
          label="Nombre *"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Bono por peaje transitado"
          required
        />
        <Select
          label="Alcance *"
          value={scope}
          onChange={(e) => {
            onScopeChange(e.target.value as 'COUNTRY' | 'PARTY');
            onPartyIdChange('');
          }}
          options={[
            { value: 'COUNTRY', label: 'Todas las compañías del país' },
            { value: 'PARTY', label: 'Solo una compañía' },
          ]}
        />
        {scope === 'PARTY' && (
          <Select
            label="Compañía *"
            value={selectedCarrierId}
            onChange={(e) => {
              const carrier = carriers.find((p) => p.carrierId === e.target.value);
              onCarrierChange(e.target.value);
              onPartyIdChange(carrier?.partyId ?? '');
            }}
            options={[
              { value: '', label: 'Elegir compañía...' },
              ...carriers
                .filter((p) => p.countryId === countryId)
                .map((p) => ({ value: p.carrierId, label: `${p.name} (${p.classification === 'OWN' ? 'propia' : 'tercero'})` })),
            ]}
          />
        )}
      </div>
      {scope === 'PARTY' && (
        <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 mt-3">
          Con el <strong>mismo código</strong> que una regla del país, esta la reemplaza para esta
          compañía. Con un código nuevo, se suma a las que hereda.
        </p>
      )}
    </section>
  );
}
