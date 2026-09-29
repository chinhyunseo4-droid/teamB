import { json, readJson, utmFromBody } from "./_shared.js";

const allowedEvents = new Set(["page_view", "free_trial_click", "preorder_click"]);

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const event = String(body?.type || "");
  const visitorId = String(body?.visitorId || "").slice(0, 120);
  if (!allowedEvents.has(event) || !visitorId) return json({ error: "validation" }, 400);

  try {
    const response = await fetch(env.GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: env.GOOGLE_SHEETS_TOKEN, action: "track", event, visitorId, utm: utmFromBody(body.utm) }),
    });
    if (!response.ok || !(await response.json().catch(() => ({}))).ok) throw new Error("tracking_failed");
    return json({ ok: true });
  } catch {
    return json({ ok: true });
  }
}