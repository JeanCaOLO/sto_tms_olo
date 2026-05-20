import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('El correo electrónico es requerido.');
      return;
    }
    if (!password.trim()) {
      setError('La contraseña es requerida.');
      return;
    }

    setLoading(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setLoading(false);

    if (signInError) {
      setError(signInError);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Panel izquierdo - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src="https://readdy.ai/api/search-image?query=modern%20logistics%20warehouse%20interior%20with%20trucks%20and%20cargo%20containers%2C%20professional%20industrial%20environment%2C%20teal%20and%20dark%20color%20scheme%2C%20dramatic%20lighting%2C%20high%20contrast%2C%20cinematic%20photography%20style%2C%20wide%20angle%20view%20showing%20scale%20and%20depth&width=800&height=900&seq=login-bg-01&orientation=portrait"
          alt="STO Transportes"
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-teal-900/80"></div>
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center bg-teal-500 rounded-xl shadow-lg">
              <i className="ri-truck-line text-2xl text-white"></i>
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-wide">STO</h1>
              <p className="text-teal-300 text-xs font-medium tracking-widest uppercase">Transportes OLO</p>
            </div>
          </div>

          <div>
            <h2 className="text-white text-4xl font-bold leading-tight mb-4">
              Gestión logística<br />
              <span className="text-teal-400">inteligente</span> y eficiente
            </h2>
            <p className="text-slate-300 text-base leading-relaxed mb-10">
              Plataforma multi-tenant para la gestión completa de transporte y distribución logística. Rutas, tracking, entregas y más.
            </p>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="w-8 h-8 flex items-center justify-center bg-teal-500/30 rounded-lg mb-3">
                  <i className="ri-route-line text-teal-300 text-lg"></i>
                </div>
                <p className="text-white text-sm font-semibold">Rutas</p>
                <p className="text-slate-400 text-xs mt-1">Planificación optimizada</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="w-8 h-8 flex items-center justify-center bg-teal-500/30 rounded-lg mb-3">
                  <i className="ri-map-pin-line text-teal-300 text-lg"></i>
                </div>
                <p className="text-white text-sm font-semibold">Tracking</p>
                <p className="text-slate-400 text-xs mt-1">Seguimiento en tiempo real</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="w-8 h-8 flex items-center justify-center bg-teal-500/30 rounded-lg mb-3">
                  <i className="ri-bar-chart-box-line text-teal-300 text-lg"></i>
                </div>
                <p className="text-white text-sm font-semibold">Analítica</p>
                <p className="text-slate-400 text-xs mt-1">KPIs y reportes</p>
              </div>
            </div>
          </div>

          <p className="text-slate-500 text-xs">
            © {new Date().getFullYear()} STO Sistema de Transportes OLO. Todos los derechos reservados.
          </p>
        </div>
      </div>

      {/* Panel derecho - Formulario */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">
          {/* Logo móvil */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-10 h-10 flex items-center justify-center bg-teal-600 rounded-xl">
              <i className="ri-truck-line text-xl text-white"></i>
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-900">STO</h1>
              <p className="text-teal-600 text-xs font-medium tracking-widest uppercase">Transportes OLO</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Bienvenido de vuelta</h2>
            <p className="text-slate-500 text-sm mt-2">Ingresa tus credenciales para acceder al sistema</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-slate-400">
                  <i className="ri-mail-line text-base"></i>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all placeholder:text-slate-400"
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Contraseña */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Contraseña
                </label>
                <button
                  type="button"
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium cursor-pointer whitespace-nowrap"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-slate-400">
                  <i className="ri-lock-line text-base"></i>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all placeholder:text-slate-400"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-base`}></i>
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="w-4 h-4 flex items-center justify-center mt-0.5 shrink-0">
                  <i className="ri-error-warning-line text-red-500 text-base"></i>
                </div>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <i className="ri-loader-4-line animate-spin text-base"></i>
                  <span>Ingresando...</span>
                </>
              ) : (
                <>
                  <i className="ri-login-box-line text-base"></i>
                  <span>Iniciar Sesión</span>
                </>
              )}
            </button>
          </form>

          {/* Credenciales demo */}
          <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 flex items-center justify-center">
                <i className="ri-information-line text-slate-500 text-sm"></i>
              </div>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Accesos de demostración</p>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => { setEmail('jalvarez@ologistics.com'); setPassword('Demo1234!'); setError(null); }}
                className="w-full flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 hover:border-teal-300 hover:bg-teal-50 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 flex items-center justify-center bg-teal-100 rounded-full">
                    <i className="ri-shield-star-line text-teal-600 text-sm"></i>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-slate-800">jalvarez@ologistics.com</p>
                    <p className="text-xs text-slate-500">SuperUsuario</p>
                  </div>
                </div>
                <i className="ri-arrow-right-line text-slate-400 group-hover:text-teal-500 text-sm"></i>
              </button>
              <button
                type="button"
                onClick={() => { setEmail('arojas@ologistics.com'); setPassword('Demo1234!'); setError(null); }}
                className="w-full flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 hover:border-teal-300 hover:bg-teal-50 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 flex items-center justify-center bg-amber-100 rounded-full">
                    <i className="ri-user-settings-line text-amber-600 text-sm"></i>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-slate-800">arojas@ologistics.com</p>
                    <p className="text-xs text-slate-500">Admin</p>
                  </div>
                </div>
                <i className="ri-arrow-right-line text-slate-400 group-hover:text-teal-500 text-sm"></i>
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2.5 text-center">Contraseña demo: <span className="font-mono font-semibold text-slate-600">Demo1234!</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
