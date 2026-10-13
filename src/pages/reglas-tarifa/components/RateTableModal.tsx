// Alta y edición de un tarifario: su código, su alcance y —lo importante— QUÉ variables forman su
// clave. El formulario muestra un ejemplo de fila en vivo mientras se arman las columnas: elegir la
// clave sin ver cómo queda la fila es donde la gente se equivoca y después carga sesenta filas mal.

import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { VAR_KEY_LABELS } from '../../../lib/tarifas/format';
import type { RateTable, VarKey } from '../../../lib/tarifas/types';
import type { CarrierProfile } from '../../../lib/tarifas/parties';
import { useModulePermissions } from '../../../hooks/use-module-permissions';
import { useRateTableForm } from './rate-table-modal/useRateTableForm';
import { RateTableModalHeader } from './rate-table-modal/RateTableModalHeader';
import { KeyColumnsEditor } from './rate-table-modal/KeyColumnsEditor';
import { ValueColumnsEditor } from './rate-table-modal/ValueColumnsEditor';

interface Props {
  isOpen: boolean;
  countryId: string;
  /** Tarifario a editar. Null = alta. */
  table: RateTable | null;
  parties: CarrierProfile[];
  /** Moneda del país, para la ayuda en pantalla. */
  currency?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function RateTableModal({ isOpen, countryId, table, parties, currency, onClose, onSaved }: Props) {
  const { canCreate, canEdit } = useModulePermissions('tarifas.config');
  const state = useRateTableForm(table, isOpen, countryId, parties);
  const { form, errors } = state;
  const allowed = table ? canEdit : canCreate;

  const varLabelOf = (key: VarKey) =>
    VAR_KEY_LABELS[key as keyof typeof VAR_KEY_LABELS] ?? state.customLabels[key] ?? key;

  const handleSave = async () => {
    if (await state.handleSave()) {
      await onSaved();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <RateTableModalHeader table={table} onClose={onClose} />

        <div className="px-6 py-5 space-y-5">
          {state.generalError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {state.generalError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Código *"
              value={form.code}
              onChange={(e) => state.set('code', e.target.value.toUpperCase())}
              placeholder="TARIFARIO_ZONAS"
              error={errors.code}
            />
            <Input
              label="Nombre *"
              value={form.name}
              onChange={(e) => state.set('name', e.target.value)}
              placeholder="Tarifario por zona y camión"
              error={errors.name}
            />
          </div>
          <p className="text-xs text-slate-500 -mt-3">
            El <strong>código</strong> es con el que una regla nombra este tarifario. Sin espacios ni
            acentos.
          </p>

          <Select
            label="Alcance"
            value={state.selectedCarrierId}
            onChange={(e) => {
              const carrier = parties.find((p) => p.carrierId === e.target.value);
              state.setCarrierPick(e.target.value);
              state.set('partyId', carrier?.partyId ?? null);
            }}
            options={[
              { value: '', label: 'Todo el país' },
              ...parties.map((p) => ({ value: p.carrierId, label: p.name })),
            ]}
          />
          <p className="text-xs text-slate-500 -mt-3">
            Un tarifario de compañía con el <strong>mismo código</strong> que uno del país lo
            reemplaza para esa compañía — igual que con las reglas.
          </p>

          <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-lg px-3 py-2.5 -mt-1">
            <i className="ri-money-dollar-circle-line mt-0.5 shrink-0"></i>
            <span>
              Los importes van en <strong>{currency ?? 'la moneda del país'}</strong>, que es la
              única moneda del país. No hay conversión: lo que se carga acá es lo que se paga.
            </span>
          </div>

          <KeyColumnsEditor
            keyColumns={form.keyColumns}
            valueColumns={form.valueColumns ?? []}
            hasParty={!!form.partyId}
            error={errors.keyColumns}
            disponibles={state.disponibles}
            varLabelOf={varLabelOf}
            onMove={state.moverColumna}
            onRemove={state.quitarColumna}
            onAdd={state.agregarColumna}
          />

          <ValueColumnsEditor
            text={state.valueColumnsText}
            error={errors.valueColumns}
            savedColumns={table ? (table.valueColumns ?? []) : null}
            current={form.valueColumns ?? []}
            onChange={state.cambiarColumnasDeValor}
          />

          {state.claveCambiada && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-3">
              <i className="ri-alert-line mr-1"></i>
              Cambiaste la clave de un tarifario que ya tiene filas. Las filas se reacomodan solas:
              cada variable conserva su valor y las columnas nuevas quedan en comodín
              (<code className="font-mono">*</code>). Lo que pierda su columna se pierde.
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => state.set('active', e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Tarifario activo
          </label>
        </div>

        <div className="sticky bottom-0 bg-white flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose} disabled={state.saving}>Cancelar</Button>
          <Button
            onClick={() => void handleSave()}
            disabled={state.saving || !allowed || !!state.partiesLoadingWhenPartySet}
            title={!allowed ? 'Tu rol no puede guardar tarifarios' : undefined}
          >
            <i className="ri-save-line mr-1"></i>
            {state.saving ? 'Guardando…' : table ? 'Guardar cambios' : 'Crear tarifario'}
          </Button>
        </div>
      </div>
    </div>
  );
}
