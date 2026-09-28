import { onRequestPost as applyPost } from "../functions/api/apply.js";
import { onRequestGet as configGet } from "../functions/api/config.js";
import { onRequestPost as preorderPost } from "../functions/api/preorder.js";
import { onRequestPost as trackPost } from "../functions/api/track.js";

const apiRoutes = {
  "/api/apply": { POST: applyPost },
  "/api/config": { GET: configGet },
  "/api/preorder": { POST: preorderPost },
  "/api/track": { POST: trackPost },
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const route = apiRoutes[url.pathname];
    const handler = route?.[request.method];

    if (handler) return handler({ request, env, ctx });
    return env.ASSETS.fetch(request);
  },
};