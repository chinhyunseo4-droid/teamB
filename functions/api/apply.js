import { json, readJson, saveToGoogleSheets, utmFromBody } from "./_shared.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return json({ error: "invalid_json" }, 400);

  const name = String(body.name || "").trim();
  const contactType = String(body.contactType || "").trim();
  const contact = String(body.contact || "").trim();
  const date = String(body.date || "").trim();
  const timeFrom = String(body.timeFrom || "").trim();
  const origin = String(body.origin || "").trim();
  const destination = String(body.destination || "").trim();
  const gender = String(body.gender || "").trim();
  const genderPreference = String(body.genderPreference || "").trim();
  const consentRequired = body.consentRequired === true;
  const validContactType = ["phone", "email", "x"].includes(contactType);
  const validContact = contactType === "email" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) : contactType === "phone" ? /^[0-9+\-\s()]{7,30}$/.test(contact) : /^@?[A-Za-z0-9_]{1,15}$/.test(contact);
  const invalid = name.length > 40 || !validContactType || !validContact || contact.length > 120 || !date || date.length > 10 || !timeFrom || !origin || origin.length > 200 || !destination || destination.length > 200 || !["female", "male", "other"].includes(gender) || !["same_gender_only", "any_gender"].includes(genderPreference) || !consentRequired;
  if (invalid) return json({ error: "validation" }, 400);

  try {
    await saveToGoogleSheets(env, { name, contactType, contact, date, timeFrom, origin, destination, gender, genderPreference, consentRequired }, utmFromBody(body.utm));
    return json({ ok: true });
  } catch {
    return json({ error: "google_sheets_unavailable" }, 503);
  }
}
