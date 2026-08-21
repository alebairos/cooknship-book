export type Route = {
  method: string;
  path: string;
  public: boolean;
};

export const routes: Route[] = [
  { method: 'GET', path: '/descriptor', public: true },
  { method: 'GET', path: '/', public: true },
  { method: 'GET', path: '/host/:host/board', public: false },
  { method: 'GET', path: '/host/:host/events', public: false },
  { method: 'POST', path: '/host/:host/intents/:id/upsert', public: false },
  { method: 'POST', path: '/host/:host/intents/:id/admit', public: false },
  { method: 'POST', path: '/host/:host/intents/:id/park', public: false },
  { method: 'POST', path: '/host/:host/queues/rank', public: false },
  { method: 'POST', path: '/host/:host/wis/:id/upsert', public: false },
  { method: 'POST', path: '/host/:host/wis/:id/mark-ready', public: false },
  { method: 'POST', path: '/host/:host/wis/:id/expire', public: false },
  { method: 'POST', path: '/host/:host/wis/:id/claim', public: false },
  { method: 'POST', path: '/host/:host/wis/:id/renew-lease', public: false },
  { method: 'POST', path: '/host/:host/wis/:id/close', public: false },
];

export function descriptorJson(): string {
  return JSON.stringify(
    routes.map(({ method, path, public: isPublic }) => ({ method, path, public: isPublic })),
  );
}

export function matchRoute(
  method: string,
  path: string,
): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchPath(route.path, path);
    if (params) return { route, params };
  }
  return null;
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}
