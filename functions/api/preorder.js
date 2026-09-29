import { json, readJson, saveToGoogleSheets, utmFromBody } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return json({ error: "invalid_json" }, 400);

  const email = String(body.email || "").trim().toLowerCase();
  const consentRequired = body.consentRequired === true;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailValid || email.length > 120 || !consentRequired) return json({ error: "validation" }, 400);

  try {
    await saveToGoogleSheets(env, {
      recordType: "preorder",
      name: "사전 예약 990원",
      email,
      date: "정식 출시 알림",
      timeFrom: "990원 이용 혜택",
      origin: "",
      destination: "",
      consentRequired,
    }, utmFromBody(body.utm));
    return json({ ok: true });
  } catch {
    return json({ error: "google_sheets_unavailable" }, 503);
  }
}