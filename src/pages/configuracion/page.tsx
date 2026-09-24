import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import Card from '../../components/base/Card';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import Select from '../../components/base/Select';
import UsersTab from './components/UsersTab';
import RolesTab from './components/RolesTab';

interface Organization {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  logo_url?: string;
}

type TabType = 'organization' | 'users' | 'roles' | 'preferences';

export default function ConfiguracionPage() {
  const { t } = useTranslation();
  const { appUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('organization');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Organization data
  const [organization, setOrganization] = useState<Organization>({
    id: '',
    name: '',
    address: '',
    phone: '',
    email: '',
    logo_url: ''
  });

  // Preferences data
  const [preferences, setPreferences] = useState({
    timezone: 'America/Santiago',
    currency: 'CLP',
    language: 'es',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h'
  });

  useEffect(() => {
    if (appUser?.organization_id) {
      fetchOrganization();
    }
  }, [appUser]);

  const fetchOrganization = async () => {
    if (!appUser?.organization_id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', appUser.organization_id)
        .maybeSingle();

      if (!error && data) {
        setOrganization(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOrganization = async () => {
    if (!appUser?.organization_id) return;

    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from('organizations')
      .update({
        name: organization.name,
        address: organization.address,
        phone: organization.phone,
        email: organization.email,
        logo_url: organization.logo_url
      })
      .eq('id', appUser.organization_id);

    if (error) {
      setMessage({ type: 'error', text: t('settings.saveError') });
    } else {
      setMessage({ type: 'success', text: t('settings.saveSuccess') });
      setTimeout(() => setMessage(null), 3000);
    }

    setSaving(false);
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    setMessage(null);

    localStorage.setItem('app_preferences', JSON.stringify(preferences));

    setMessage({ type: 'success', text: t('settings.prefsSuccess') });
    setTimeout(() => setMessage(null), 3000);
    setSaving(false);
  };

  const tabs = [
    { id: 'organization' as TabType, label: t('settings.tabOrganization'), icon: 'ri-building-line' },
    { id: 'users' as TabType, label: t('settings.tabUsers'), icon: 'ri-user-line' },
    { id: 'roles' as TabType, label: t('settings.tabRoles'), icon: 'ri-shield-user-line' },
    { id: 'preferences' as TabType, label: t('settings.tabPreferences'), icon: 'ri-settings-3-line' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <i className="ri-loader-4-line animate-spin text-teal-600 text-2xl"></i>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">{t('settings.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('settings.subtitle')}</p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700'
        }`}>
          <i className={`${message.type === 'success' ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} text-xl`}></i>
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar Tabs */}
        <div className="col-span-3">
          <Card className="p-2">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-teal-50 text-teal-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <i className={`${tab.icon} text-lg`}></i>
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </Card>
        </div>

        {/* Content Area */}
        <div className="col-span-9">
          {activeTab === 'organization' && (
            <Card className="p-6">
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{t('settings.orgInfoTitle')}</h2>
                  <p className="text-sm text-slate-500 mt-1">{t('settings.orgInfoSubtitle')}</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t('settings.orgName')}
                    </label>
                    <Input
                      value={organization.name}
                      onChange={(e) => setOrganization({ ...organization, name: e.target.value })}
                      placeholder={t('settings.orgNamePlaceholder')}
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t('settings.orgAddress')}
                    </label>
                    <Input
                      value={organization.address}
                      onChange={(e) => setOrganization({ ...organization, address: e.target.value })}
                      placeholder={t('settings.orgAddressPlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t('settings.orgPhone')}
                    </label>
                    <Input
                      value={organization.phone}
                      onChange={(e) => setOrganization({ ...organization, phone: e.target.value })}
                      placeholder={t('settings.orgPhonePlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t('settings.orgEmail')}
                    </label>
                    <Input
                      type="email"
                      value={organization.email}
                      onChange={(e) => setOrganization({ ...organization, email: e.target.value })}
                      placeholder={t('settings.orgEmailPlaceholder')}
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t('settings.orgLogoUrl')}
                    </label>
                    <Input
                      value={organization.logo_url || ''}
                      onChange={(e) => setOrganization({ ...organization, logo_url: e.target.value })}
                      placeholder={t('settings.orgLogoPlaceholder')}
                    />
                    {organization.logo_url && (
                      <div className="mt-3 p-4 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-500 mb-2">{t('settings.logoPreview')}</p>
                        <img 
                          src={organization.logo_url} 
                          alt="Logo" 
                          className="h-16 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-200">
                  <Button
                    onClick={handleSaveOrganization}
                    disabled={saving}
                    className="cursor-pointer whitespace-nowrap"
                  >
                    {saving ? (
                      <>
                        <i className="ri-loader-4-line animate-spin"></i>
                        <span>{t('settings.saving')}</span>
                      </>
                    ) : (
                      <>
                        <i className="ri-save-line"></i>
                        <span>{t('settings.saveChanges')}</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'users' && appUser?.organization_id && (
            <UsersTab />
          )}

          {activeTab === 'roles' && (
            <RolesTab />
          )}

          {activeTab === 'preferences' && (
            <Card className="p-6">
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{t('settings.prefsTitle')}</h2>
                  <p className="text-sm text-slate-500 mt-1">{t('settings.prefsSubtitle')}</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t('settings.timezone')}
                    </label>
                    <Select
                      value={preferences.timezone}
                      onChange={(e) => setPreferences({ ...preferences, timezone: e.target.value })}
                    >
                      <option value="America/Santiago">Santiago (GMT-3)</option>
                      <option value="America/Buenos_Aires">Buenos Aires (GMT-3)</option>
                      <option value="America/Lima">Lima (GMT-5)</option>
                      <option value="America/Bogota">Bogotá (GMT-5)</option>
                      <option value="America/Mexico_City">Ciudad de México (GMT-6)</option>
                      <option value="America/Sao_Paulo">São Paulo (GMT-3)</option>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t('settings.currency')}
                    </label>
                    <Select
                      value={preferences.currency}
                      onChange={(e) => setPreferences({ ...preferences, currency: e.target.value })}
                    >
                      <option value="CLP">Peso Chileno (CLP)</option>
                      <option value="USD">Dólar Estadounidense (USD)</option>
                      <option value="EUR">Euro (EUR)</option>
                      <option value="ARS">Peso Argentino (ARS)</option>
                      <option value="PEN">Sol Peruano (PEN)</option>
                      <option value="COP">Peso Colombiano (COP)</option>
                      <option value="MXN">Peso Mexicano (MXN)</option>
                      <option value="BRL">Real Brasileño (BRL)</option>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t('settings.language')}
                    </label>
                    <Select
                      value={preferences.language}
                      onChange={(e) => setPreferences({ ...preferences, language: e.target.value })}
                    >
                      <option value="es">Español</option>
                      <option value="en">English</option>
                      <option value="pt">Português</option>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t('settings.dateFormat')}
                    </label>
                    <Select
                      value={preferences.dateFormat}
                      onChange={(e) => setPreferences({ ...preferences, dateFormat: e.target.value })}
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t('settings.timeFormat')}
                    </label>
                    <Select
                      value={preferences.timeFormat}
                      onChange={(e) => setPreferences({ ...preferences, timeFormat: e.target.value })}
                    >
                      <option value="24h">{t('settings.time24h')}</option>
                      <option value="12h">{t('settings.time12h')}</option>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-200">
                  <Button
                    onClick={handleSavePreferences}
                    disabled={saving}
                    className="cursor-pointer whitespace-nowrap"
                  >
                    {saving ? (
                      <>
                        <i className="ri-loader-4-line animate-spin"></i>
                        <span>{t('settings.saving')}</span>
                      </>
                    ) : (
                      <>
                        <i className="ri-save-line"></i>
                        <span>{t('settings.savePreferences')}</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}