// Botón oficial "Iniciar sesión con Google" (Google Identity Services). Google devuelve un
// ID token firmado (credential) que el backend valida en POST /api/auth/google.
// El ID de cliente es público (va en el navegador); el secreto del cliente no se usa.

const GSI_SRC = 'https://accounts.google.com/gsi/client';

export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

interface GoogleIdApi {
  initialize(config: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup' }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

let gsiLoading: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  gsiLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiLoading = null;
      reject(new Error('No se pudo cargar el inicio de sesión de Google.'));
    };
    document.head.appendChild(script);
  });
  return gsiLoading;
}

/** Pinta el botón de Google en `el`. Devuelve la limpieza para el efecto de React. */
export function mountGoogleButton(
  el: HTMLElement | null,
  onCredential: (credential: string) => void,
  onError: (message: string) => void,
): () => void {
  let cancelled = false;
  if (!el || !GOOGLE_CLIENT_ID) return () => {};
  loadGsi()
    .then(() => {
      const api = window.google?.accounts.id;
      if (cancelled || !api) return;
      api.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => onCredential(r.credential), ux_mode: 'popup' });
      api.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'es', width: el.clientWidth || 400 });
    })
    .catch((e: Error) => !cancelled && onError(e.message));
  return () => {
    cancelled = true;
  };
}
