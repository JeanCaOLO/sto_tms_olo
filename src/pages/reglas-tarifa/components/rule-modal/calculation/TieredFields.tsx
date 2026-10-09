// Operador "Por tramos": cómo se interpreta el importe de cada tramo y la tabla de tramos.

import Button from '../../../../../components/base/Button';
import Select from '../../../../../components/base/Select';
import { TIER_MODE_LABELS, TIER_MODE_HINTS, emptyTier } from '../../../../../lib/tarifas/rule-builder';
import type { FieldsProps, Tier } from './types';

const TIER_MODE_OPTIONS = [
  { value: 'RATE' as const, label: TIER_MODE_LABELS.RATE },
  { value: 'PROGRESSIVE' as const, label: TIER_MODE_LABELS.PROGRESSIVE },
  { value: 'FLAT' as const, label: TIER_MODE_LABELS.FLAT },
];

const FIELD = 'px-2 py-1 border border-slate-200 rounded text-sm';
const FOCUS = 'focus:outline-none focus:ring-2 focus:ring-teal-500';

interface TierRowProps {
  tier: Tier;
  desde: string;
  onUpTo: (raw: string) => void;
  onAmount: (value: string) => void;
  onRemove: () => void;
}

function TierRow({ tier, desde, onUpTo, onAmount, onRemove }: TierRowProps) {
  return (
    <tr>
      <td className="px-3 py-1.5 text-slate-500">{desde}</td>
      <td className="px-3 py-1.5">
        <input
          type="number"
          value={tier.upTo === null ? '' : String(tier.upTo)}
          placeholder="sin límite"
          onChange={(e) => onUpTo(e.target.value.trim())}
          className={`w-32 ${FIELD} ${FOCUS}`}
        />
      </td>
      <td className="px-3 py-1.5">
        <input value={tier.amount} onChange={(e) => onAmount(e.target.value)} className={`w-28 ${FIELD} font-mono ${FOCUS}`} />
      </td>
      <td className="px-3 py-1.5 text-right">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <i className="ri-delete-bin-line"></i>
        </Button>
      </td>
    </tr>
  );
}

export function TieredFields({ builder, builderErrors, onChange, currencyLabel }: FieldsProps & { currencyLabel: string }) {
  const tiers = builder.tiers ?? [];
  const patchTier = (idx: number, patch: Partial<Tier>) => {
    const next = [...tiers];
    next[idx] = { ...tiers[idx]!, ...patch };
    onChange('tiers', next);
  };

  return (
    <div className="mt-3 space-y-3">
      <Select
        label="¿Qué significa el importe de cada tramo? *"
        value={builder.tierMode ?? 'RATE'}
        onChange={(e) => onChange('tierMode', e.target.value as NonNullable<typeof builder.tierMode>)}
        options={TIER_MODE_OPTIONS}
      />
      <p className="text-xs text-gray-500">{TIER_MODE_HINTS[builder.tierMode ?? 'RATE']}</p>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-medium text-slate-500 uppercase">
              <th className="px-3 py-2">Desde</th>
              <th className="px-3 py-2">Hasta (inclusive)</th>
              <th className="px-3 py-2">Importe ({currencyLabel})</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tiers.map((tier, idx) => (
              <TierRow
                key={idx}
                tier={tier}
                desde={idx === 0 ? '0' : String((tiers[idx - 1]?.upTo ?? 0) + 1)}
                onUpTo={(raw) => patchTier(idx, { upTo: raw === '' ? null : Number(raw) })}
                onAmount={(amount) => patchTier(idx, { amount })}
                onRemove={() => onChange('tiers', tiers.filter((_, i) => i !== idx))}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange('tiers', [...tiers, emptyTier()])}>
          <i className="ri-add-line mr-1"></i> Agregar tramo
        </Button>
        {builderErrors.tiers && <span className="text-xs text-red-600">{builderErrors.tiers}</span>}
      </div>
    </div>
  );
}
