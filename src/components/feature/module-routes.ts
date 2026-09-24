import { isGroup, navItems } from './sidebar-nav-items';

// path exacto -> permKey del módulo, derivado de navItems (una sola fuente).
// Lo comparten RouteGuard (gating + evento view) y DataTable (evento export).
const permByPath = new Map<string, string>();
for (const item of navItems) {
  if (isGroup(item)) {
    for (const child of item.children) {
      if (child.permKey) permByPath.set(child.path, child.permKey);
    }
  } else if (item.permKey) {
    permByPath.set(item.path, item.permKey);
  }
}

export function permKeyForPath(pathname: string): string | undefined {
  return permByPath.get(pathname);
}
