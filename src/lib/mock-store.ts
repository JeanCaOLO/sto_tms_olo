const PREFIX = 'sto_mock_';

// ponytail: localStorage JSON list, not a real DB — only exists because writes
// to Supabase are blocked by RLS without a real authenticated session (see
// MOCKING.md). Swap for real persistence once auth/RLS is wired up.
export function readMockList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export function prependMockItem<T>(key: string, item: T): void {
  const items = readMockList<T>(key);
  items.unshift(item);
  localStorage.setItem(PREFIX + key, JSON.stringify(items));
}

export function removeMockItem<T extends { id: string }>(key: string, id: string): void {
  const items = readMockList<T>(key).filter((item) => item.id !== id);
  localStorage.setItem(PREFIX + key, JSON.stringify(items));
}

export function clearMockList(key: string): void {
  localStorage.removeItem(PREFIX + key);
}
