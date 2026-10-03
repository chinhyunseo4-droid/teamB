const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function utmFromBody(value) {
  return value && typeof value === "object" ? value : {};
}

export async function saveToGoogleSheets(env, application, utm) {
  const url = env.GOOGLE_SHEETS_WEBHOOK_URL;
  const token = env.GOOGLE_SHEETS_TOKEN;
  if (!url || !token) throw new Error("missing_google_sheets_config");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      token,
      recordType: application.recordType || "application",
      name: application.name,
      contact: application.contact || application.email,
      contactType: application.contactType || "email",
      date: application.date,
      timeFrom: application.timeFrom,
      origin: application.origin,
      destination: application.destination,
      gender: application.gender,
      genderPreference: application.genderPreference,
      consentRequired: application.consentRequired,
      utm,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error("google_sheets_save_failed");
}