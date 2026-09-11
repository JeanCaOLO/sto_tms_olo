import { useState, useEffect } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Input from '../../../components/base/Input';
import Select from '../../../components/base/Select';
import { deleteFxRate, listFxRates, saveFxRate } from '../../../lib/tarifas/localRulesDataSource';
import HelpButton from './HelpButton';

interface FxRatesSectionProps {
  organizationId: string;
  countries: { id: string; name: string }[];
}

// Solo hacen falta tasas acá si una regla usa "Moneda local" (currency_mode LOCAL) con una moneda
// distinta a la de referencia del país — si no, el motor consolida sin conversión.
export default function FxRatesSection({ organizationId, countries }: FxRatesSectionProps) {
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    countryId: countries[0]?.id ?? '', from: '', to: '', rate: '1', type: 'OFFICIAL',
    source: '', validFrom: new Date().toISOString().split('T')[0],
  });

  const load = async () => {
    setLoading(true);
    setRates(await listFxRates(organizationId));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const countryLabel = (id: string) => countries.find((c) => c.id === id)?.name || id;

  const handleAdd = async () => {
    if (!form.countryId || !form.from || !form.to) return;
    await saveFxRate(organizationId, {
      country_id: form.countryId,
      from_currency: form.from.toUpperCase(),
      to_currency: form.to.toUpperCase(),
      rate: form.rate,
      rate_type: form.type,
      source: form.source,
      valid_from: new Date(form.validFrom).toISOString(),
    });
    setForm({ countryId: form.countryId, from: '', to: '', rate: '1', type: 'OFFICIAL', source: '', validFrom: new Date().toISOString().split('T')[0] });
    await load();
  };

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Tasas de cambio</h3>
        <HelpButton
          title="Tasas de cambio"
          steps={[
            'Solo hacen falta si vas a usar reglas en "Moneda local" con una moneda distinta a la de referencia del país.',
            'El motor las usa para consolidar el monto liquidado en la moneda de referencia del país.',
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end mb-3">
        <Select
          label="País"
          value={form.countryId}
          onChange={(e) => setForm({ ...form, countryId: e.target.value })}
          options={countries.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Input label="Desde (local)" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="Ej: COP" />
        <Input label="Hacia (referencia)" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="Ej: USD" />
        <Input label="Tasa" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="Ej: 4000" />
        <Input label="Vigente desde" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
        <Button variant="secondary" onClick={handleAdd}><i className="ri-add-line"></i>Agregar</Button>
      </div>

      {loading ? (
        <div className="text-center py-6 text-slate-400"><i className="ri-loader-4-line animate-spin"></i></div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2">País</th>
              <th className="text-left py-2">Par</th>
              <th className="text-left py-2">Tasa</th>
              <th className="text-left py-2">Vigente desde</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2">{countryLabel(r.country_id)}</td>
                <td className="py-2">{r.from_currency} → {r.to_currency}</td>
                <td className="py-2">{r.rate}</td>
                <td className="py-2">{new Date(r.valid_from).toLocaleDateString('es-ES')}</td>
                <td className="py-2 text-right">
                  <button onClick={async () => { await deleteFxRate(r.id); await load(); }} className="text-red-500 hover:bg-red-50 rounded-lg p-1">
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </td>
              </tr>
            ))}
            {rates.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-slate-400">Sin tasas configuradas.</td></tr>}
          </tbody>
        </table>
      )}
    </Card>
  );
}
