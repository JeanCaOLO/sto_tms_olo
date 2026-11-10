import { useEffect, useRef } from 'react';
import { GOOGLE_CLIENT_ID, mountGoogleButton } from '../../../lib/google-identity';
import { signInWithGoogle } from '../../../lib/google-login';

interface Props {
  onError: (message: string | null) => void;
}

// "Iniciar sesión con Google" debajo del formulario. Al entrar recarga la app en "/": el
// AuthProvider toma la sesión guardada como en cualquier arranque.
export default function GoogleLoginButton({ onError }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  async function handleCredential(credential: string) {
    onError(null);
    const message = await signInWithGoogle(credential);
    if (message) onError(message);
    else window.location.assign('/');
  }

  useEffect(() => mountGoogleButton(ref.current, handleCredential, onError), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-px flex-1 bg-slate-200"></div>
        <span className="text-xs text-slate-400">o</span>
        <div className="h-px flex-1 bg-slate-200"></div>
      </div>
      <div ref={ref} className="flex justify-center"></div>
      <p className="text-xs text-slate-400 text-center mt-3">Solo cuentas @ologistics.com o @intelix.biz</p>
    </div>
  );
}
