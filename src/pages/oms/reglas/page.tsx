import { useState } from 'react';
import Card from '../../../components/base/Card';
import Button from '../../../components/base/Button';
import Badge from '../../../components/base/Badge';
import Input from '../../../components/base/Input';
import { mockRules } from '../mockData';
import type { OmsRule } from '../mockData';

export default function OmsReglas() {
  const [rules, setRules] = useState<OmsRule[]>(mockRules);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ name: '', condition: '', profile: 'General' });

  const profiles = Array.from(new Set(rules.map((rule) => rule.profile)));

  const toggleActive = (id: string) => {
    setRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, active: !rule.active } : rule)));
  };

  const addRule = () => {
    if (!draft.name.trim() || !draft.condition.trim()) return;
    setRules((prev) => [
      ...prev,
      {
        id: `draft-${prev.length + 1}`,
        name: draft.name,
        condition: draft.condition,
        weight: 50,
        active: true,
        profile: draft.profile || 'General',
      },
    ]);
    setDraft({ name: '', condition: '', profile: 'General' });
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Motor de Reglas</h1>
          <p className="text-sm text-slate-600 mt-1">
            Jerarquía de reglas de negocio que calculan el nivel de prioridad
          </p>
        </div>
        <Button icon={<i className="ri-add-line"></i>} onClick={() => setShowForm(!showForm)}>
          Nueva regla
        </Button>
      </div>

      {showForm && (
        <Card>
          <p className="text-sm font-semibold text-slate-900 mb-4">Nueva regla (si / entonces)</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Nombre"
              placeholder="Ej: Cliente VIP"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Input
              label="Condición"
              placeholder="Ej: SI cliente.tier = VIP"
              value={draft.condition}
              onChange={(e) => setDraft({ ...draft, condition: e.target.value })}
            />
            <Input
              label="Perfil"
              placeholder="Ej: General"
              value={draft.profile}
              onChange={(e) => setDraft({ ...draft, profile: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button onClick={addRule}>Guardar regla</Button>
          </div>
        </Card>
      )}

      {profiles.map((profile) => (
        <Card key={profile}>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">{profile}</h2>
          <div className="space-y-3">
            {rules
              .filter((rule) => rule.profile === profile)
              .map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-3 border border-slate-100 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{rule.name}</p>
                      <Badge variant={rule.active ? 'success' : 'default'} size="sm">
                        {rule.active ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{rule.condition}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Peso</p>
                      <p className="text-sm font-semibold text-slate-900">{rule.weight}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(rule.id)}>
                      {rule.active ? 'Desactivar' : 'Activar'}
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
