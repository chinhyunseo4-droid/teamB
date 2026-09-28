import { json } from "./_shared.js";

// Analytics is intentionally lightweight on the free plan. Form submissions are stored in Google Sheets.
export function onRequestPost() {
  return json({ ok: true });
}