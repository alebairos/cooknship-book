import { bearerOk } from './auth.js';
import { descriptorJson, matchRoute } from './routes.js';

export { BookDO } from './book-do.js';

export interface Env {
  BOOK: DurableObjectNamespace;
  BEARER_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = matchRoute(request.method, url.pathname);
    if (!match) return new Response('Not Found', { status: 404 });

    if (!match.route.public && !bearerOk(request, env.BEARER_TOKEN)) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (match.route.path === '/descriptor') {
      return new Response(descriptorJson(), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (match.route.path === '/') {
      return new Response('cooknship-book', { status: 200 });
    }

    return new Response('Not Implemented', { status: 501 });
  },
};
