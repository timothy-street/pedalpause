// Entry point for the pedalpause Cloudflare Worker.
//
// The site is deployed with Workers Builds, which serves the static files but does not
// run the functions/ folder on its own (that is a Cloudflare Pages feature). This small
// file routes the two form endpoints to their handlers in functions/api/ and hands every
// other request to the static files, exactly as before.

import * as submitEvent from './functions/api/submit-event.js';
import * as askRules from './functions/api/ask-rules.js';

const ROUTES = {
  '/api/submit-event': submitEvent,
  '/api/ask-rules': askRules,
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const route = ROUTES[pathname.replace(/\/$/, '')];
    if (route) {
      const context = { request, env, waitUntil: (p) => ctx.waitUntil(p) };
      if (request.method === 'POST' && route.onRequestPost) return route.onRequestPost(context);
      return route.onRequest(context);
    }
    return env.ASSETS.fetch(request);
  },
};
