import { json, readJson } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!env.ADMIN_PASSWORD || body?.password !== env.ADMIN_PASSWORD) return json({ error: "unauthorized" }, 401);
  try {
    const response = await fetch(env.GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: env.GOOGLE_SHEETS_TOKEN, action: "analytics_stats" }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error("analytics_unavailable");
    return json(result);
  } catch {
    return json({ error: "analytics_unavailable" }, 503);
  }
}