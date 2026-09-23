import { useCallback, useEffect, useState } from 'react';
import { listUsers, type AdminUser } from './admin-api';

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
}

function statsOf(users: AdminUser[]): UserStats {
  const active = users.filter((u) => u.status === 'active').length;
  return { total: users.length, active, inactive: users.length - active };
}

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await listUsers());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { users, stats: statsOf(users), loading, error, reload };
}
