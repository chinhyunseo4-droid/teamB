import { json, readJson, saveToGoogleSheets, utmFromBody } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return json({ error: "invalid_json" }, 400);

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const date = String(body.date || "").trim();
  const timeFrom = String(body.timeFrom || "").trim();
  const origin = String(body.origin || "").trim();
  const destination = String(body.destination || "").trim();
  const consentRequired = body.consentRequired === true;
  const invalid = name.length > 40 || !email || email.length > 80 || !date || date.length > 120 || !timeFrom || !origin || origin.length > 80 || !destination || destination.length > 80 || !consentRequired;
  if (invalid) return json({ error: "validation" }, 400);

  try {
    await saveToGoogleSheets(env, { name, email, date, timeFrom, origin, destination, consentRequired }, utmFromBody(body.utm));
    return json({ ok: true });
  } catch {
    return json({ error: "google_sheets_unavailable" }, 503);
  }
}