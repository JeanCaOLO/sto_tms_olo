import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/supabase';

export interface AppNotification {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  detail: string;
  time: string;
  read: boolean;
}

// Alerta de vencimiento del backend (GET /api/v1/alerts/expirations). Ya viene
// filtrada por lo que el usuario puede ver (su país y sus módulos).
interface ExpirationAlert {
  type: 'carrier_contract' | 'driver_license';
  entity_id: string;
  name: string;
  code?: string | null;
  carrier_name?: string | null;
  license_number?: string | null;
  country_id?: string | null;
  expiry_date: string; // YYYY-MM-DD
  days_left: number; // < 0 = vencido hace N días; 0 = vence hoy
  status: 'expired' | 'due_soon';
}

const READ_KEY = 'sto_notif_read';

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage no disponible (modo privado / SSR): degradar a solo-memoria.
  }
}

/** Texto de "cuánto falta/hace" a partir de days_left. */
function whenText(daysLeft: number): string {
  if (daysLeft < 0) return `Venció hace ${Math.abs(daysLeft)} día${Math.abs(daysLeft) === 1 ? '' : 's'}`;
  if (daysLeft === 0) return 'Vence hoy';
  return `Vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'}`;
}

/** Mapea una alerta de vencimiento a la notificación de la campana. */
function toNotification(a: ExpirationAlert, read: boolean): AppNotification {
  const expired = a.status === 'expired';
  const esContrato = a.type === 'carrier_contract';
  const title = esContrato
    ? (expired ? 'Contrato vencido' : 'Contrato por vencer')
    : (expired ? 'Licencia vencida' : 'Licencia por vencer');
  const quien = esContrato
    ? a.name
    : `${a.name}${a.carrier_name ? ` (${a.carrier_name})` : ''}`;
  return {
    // id estable por entidad+fecha: el "leído" sobrevive mientras siga vigente;
    // si la fecha cambia (se renovó), es una alerta nueva y vuelve a avisar.
    id: `exp:${a.type}:${a.entity_id}:${a.expiry_date}`,
    icon: esContrato ? 'ri-file-text-line' : 'ri-bank-card-line',
    iconColor: expired ? 'red' : 'amber',
    title,
    detail: `${quien} · ${whenText(a.days_left)}`,
    time: a.expiry_date,
    read,
  };
}

export function useNotifications() {
  const [alerts, setAlerts] = useState<ExpirationAlert[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds());

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/alerts/expirations')
      .then(({ ok, body }) => {
        if (alive && ok && Array.isArray(body?.data)) setAlerts(body.data as ExpirationAlert[]);
      })
      .catch(() => { /* la campana no debe romper el header si el endpoint falla */ });
    return () => { alive = false; };
  }, []);

  const items = useMemo(
    () => alerts.map((a) => toNotification(a, readIds.has(`exp:${a.type}:${a.entity_id}:${a.expiry_date}`))),
    [alerts, readIds],
  );

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const persist = useCallback((next: Set<string>) => {
    saveReadIds(next);
    setReadIds(new Set(next));
  }, []);

  const markAllRead = useCallback(() => {
    persist(new Set(items.map((n) => n.id)));
  }, [items, persist]);

  const markRead = useCallback((id: string) => {
    const next = loadReadIds();
    next.add(id);
    persist(next);
  }, [persist]);

  return { items, unreadCount, markAllRead, markRead };
}
