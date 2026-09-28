import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./lib/env.js";
import { applicationDefaults, createStore } from "./lib/store.js";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
loadEnv(rootDir);

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";
const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL || "[운영팀 이메일]";
const RETENTION_PERIOD = process.env.RETENTION_PERIOD || "[보관 기간]";
const GOOGLE_SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || "";
const GOOGLE_SHEETS_TOKEN = process.env.GOOGLE_SHEETS_TOKEN || "";
const SERVICE_NAME = process.env.SERVICE_NAME || "고대타";
const FIGMA_FILE_URL = process.env.FIGMA_FILE_URL || "[피그마 링크]";
const FIGMA_EMBED_URL = process.env.FIGMA_EMBED_URL || buildFigmaEmbed(FIGMA_FILE_URL);

const publicDir = join(rootDir, "public");
const store = createStore(join(rootDir, "data", "db.json"));
const sessions = new Map();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const EVENT_TYPES = new Set([
  "page_view",
  "cta_click",
  "form_start",
  "form_submit_success",
  "figma_preview",
]);

function buildFigmaEmbed(url) {
  if (!url || url.startsWith("[")) return "";
  if (url.includes("figma.com/embed")) return url;
  return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`;
}

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

function cookie(name, value, extra = "") {
  return `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; HttpOnly; Max-Age=31536000${extra}`;
}

function applyHeaders(res, headers = {}) {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

function sendJson(res, status, body, extraHeaders = {}) {
  applyHeaders(res, extraHeaders);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 200_000) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolveBody({});
      try {
        resolveBody(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isAdmin(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.godeata_admin;
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp || Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}


async function saveToGoogleSheets(application, utm) {
  if (!GOOGLE_SHEETS_WEBHOOK_URL || !GOOGLE_SHEETS_TOKEN) return;
  const response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      token: GOOGLE_SHEETS_TOKEN,
      name: application.name,
      contact: application.email,
      date: application.date,
      timeFrom: application.timeFrom,
      origin: application.origin,
      destination: application.destination,
      consentRequired: application.consentRequired,
      utm,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error("google_sheets_save_failed");
}

function parseUtm(searchParams) {
  const keys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ];
  const utm = {};
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) utm[key] = String(value).slice(0, 120);
  }
  return utm;
}

function ensureVisitor(db, visitorId, utm, now) {
  if (!db.visitors[visitorId]) {
    db.visitors[visitorId] = {
      id: visitorId,
      firstSeen: now,
      lastSeen: now,
      utm,
    };
  } else {
    db.visitors[visitorId].lastSeen = now;
    if (!db.visitors[visitorId].utm || !Object.keys(db.visitors[visitorId].utm).length) {
      db.visitors[visitorId].utm = utm;
    }
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isKoreaEmail(email) {
  return /^[^\s@]+@korea\.ac\.kr$/.test(email);
}

function publicConfig() {
  return {
    serviceName: SERVICE_NAME,
    operatorEmail: OPERATOR_EMAIL,
    retentionPeriod: RETENTION_PERIOD,
    figmaFileUrl: FIGMA_FILE_URL,
    figmaEmbedUrl: FIGMA_EMBED_URL,
    figmaAvailable: Boolean(FIGMA_EMBED_URL) && !FIGMA_FILE_URL.startsWith("["),
  };
}

function serveStatic(req, res, pathname, extraHeaders = {}) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  if (rel.includes("..")) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  const filePath = resolve(publicDir, rel.slice(1));
  if (!filePath.startsWith(resolve(publicDir))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const ext = extname(filePath);
  applyHeaders(res, extraHeaders);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(readFileSync(filePath));
}

function uniqueCount(events, type) {
  const ids = new Set(events.filter((e) => e.type === type).map((e) => e.visitorId));
  return ids.size;
}

function computeStats(db) {
  // Count milestones reached, including applicants who later become no-shows.
  const reached = (field) => new Set(db.applications.filter((a) => a[field]).map((a) => a.email)).size;
  const matchedUnique = reached("matchedAt");
  const paymentRequestedUnique = reached("paymentRequestedAt");
  const paidUnique = reached("paidAt");
  const visitors = Object.keys(db.visitors);
  const uniqueVisitors = visitors.length;
  const ctaUnique = uniqueCount(db.events, "cta_click");
  const formStartUnique = uniqueCount(db.events, "form_start");
  const submitUnique = uniqueCount(db.events, "form_submit_success");
  const figmaUnique = uniqueCount(db.events, "figma_preview");
  const uniqueApplicants = new Set(
    db.applications.map((a) => a.email)
  ).size;

  const bySource = {};
  for (const id of visitors) {
    const source = db.visitors[id].utm?.utm_source || "(none)";
    if (!bySource[source]) {
      bySource[source] = {
        utm_source: source,
        uniqueVisitors: 0,
        ctaUnique: 0,
        submitUnique: 0,
      };
    }
    bySource[source].uniqueVisitors += 1;
  }
  for (const event of db.events) {
    const source = db.visitors[event.visitorId]?.utm?.utm_source || "(none)";
    if (!bySource[source]) continue;
    if (event.type === "cta_click") bySource[source].ctaClicks = (bySource[source].ctaClicks || 0) + 1;
  }
  const ctaVisitorsBySource = {};
  const submitVisitorsBySource = {};
  for (const event of db.events) {
    const source = db.visitors[event.visitorId]?.utm?.utm_source || "(none)";
    if (event.type === "cta_click") {
      ctaVisitorsBySource[source] ||= new Set();
      ctaVisitorsBySource[source].add(event.visitorId);
    }
    if (event.type === "form_submit_success") {
      submitVisitorsBySource[source] ||= new Set();
      submitVisitorsBySource[source].add(event.visitorId);
    }
  }
  for (const source of Object.keys(bySource)) {
    bySource[source].ctaUnique = ctaVisitorsBySource[source]?.size || 0;
    bySource[source].submitUnique = submitVisitorsBySource[source]?.size || 0;
    bySource[source].ctaRate =
      bySource[source].uniqueVisitors === 0
        ? 0
        : bySource[source].ctaUnique / bySource[source].uniqueVisitors;
    bySource[source].applyRate =
      bySource[source].uniqueVisitors === 0
        ? 0
        : bySource[source].submitUnique / bySource[source].uniqueVisitors;
  }

  return {
    uniqueVisitors,
    ctaUnique,
    formStartUnique,
    submitUnique,
    figmaUnique,
    uniqueApplicants,
    matchedUnique,
    paymentRequestedUnique,
    paidUnique,
    matchRate: uniqueApplicants === 0 ? 0 : matchedUnique / uniqueApplicants,
    paymentConversionRate: paymentRequestedUnique === 0 ? 0 : paidUnique / paymentRequestedUnique,
    ctaRate: uniqueVisitors === 0 ? 0 : ctaUnique / uniqueVisitors,
    applyRate: uniqueVisitors === 0 ? 0 : submitUnique / uniqueVisitors,
    totalEvents: db.events.length,
    totalApplicationRows: db.applications.length,
    channels: Object.values(bySource).sort(
      (a, b) => b.uniqueVisitors - a.uniqueVisitors
    ),
    applications: [...db.applications].sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : -1
    ),
  };
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const { pathname } = url;
    const cookies = parseCookies(req.headers.cookie);
    let visitorId = cookies.godeata_vid;
    const setCookies = [];
    if (!visitorId) {
      visitorId = randomUUID();
      setCookies.push(cookie("godeata_vid", visitorId));
    }

    const withCookies = (headers = {}) => {
      if (!setCookies.length) return headers;
      return { ...headers, "Set-Cookie": setCookies };
    };

    if (pathname === "/api/config" && req.method === "GET") {
      return sendJson(res, 200, publicConfig(), withCookies());
    }

    if (pathname === "/api/track" && req.method === "POST") {
      const body = await readBody(req);
      const type = String(body.type || "");
      if (!EVENT_TYPES.has(type)) {
        return sendJson(res, 400, { error: "unknown_event" }, withCookies());
      }
      const utm = body.utm && typeof body.utm === "object" ? body.utm : {};
      const now = new Date().toISOString();
      await store.mutate((db) => {
        ensureVisitor(db, visitorId, {
          utm_source: utm.utm_source,
          utm_medium: utm.utm_medium,
          utm_campaign: utm.utm_campaign,
          utm_content: utm.utm_content,
          utm_term: utm.utm_term,
        }, now);
        db.events.push({
          id: randomUUID(),
          visitorId,
          type,
          at: now,
          utm: db.visitors[visitorId].utm,
        });
      });
      return sendJson(res, 200, { ok: true }, withCookies());
    }

    if (pathname === "/api/apply" && req.method === "POST") {
      const body = await readBody(req);
      const errors = [];
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim();
      const date = String(body.date || "").trim();
      const timeFrom = String(body.timeFrom || "").trim();
      const timeTo = String(body.timeTo || "").trim();
      const origin = String(body.origin || "").trim();
      const destination = String(body.destination || "").trim();
      const consentRequired = Boolean(body.consentRequired);

      if (name.length > 40) errors.push("name");
      if (!email || email.length > 80) errors.push("email");
      if (!date || date.length > 120) errors.push("date");
      if (!timeFrom) errors.push("timeFrom");
      if (!origin || origin.length > 80) errors.push("origin");
      if (!destination || destination.length > 80) errors.push("destination");
      if (!consentRequired) errors.push("consentRequired");

      if (errors.length) {
        return sendJson(
          res,
          400,
          { error: "validation", fields: errors },
          withCookies()
        );
      }

      const now = new Date().toISOString();
      const utmFromBody = body.utm && typeof body.utm === "object" ? body.utm : {};

      const applicationForSheet = { name, email, date, timeFrom, origin, destination, consentRequired };
      try {
        await saveToGoogleSheets(applicationForSheet, utmFromBody);
      } catch {
        return sendJson(res, 503, { error: "google_sheets_unavailable" }, withCookies());
      }

      const result = await store.mutate((db) => {
        ensureVisitor(db, visitorId, utmFromBody, now);
        const existing = db.applications.find((a) => a.email === email);
        const record = {
          ...applicationDefaults(),
          ...existing,
          id: existing?.id || randomUUID(),
          visitorId,
          name,
          email,
          date,
          timeFrom,
          origin,
          destination,
          consentRequired,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          duplicateUpdate: Boolean(existing),
        };
        if (existing) {
          const idx = db.applications.findIndex((a) => a.email === email);
          db.applications[idx] = record;
        } else {
          db.applications.push(record);
        }
        db.events.push({
          id: randomUUID(),
          visitorId,
          type: "form_submit_success",
          at: now,
          utm: db.visitors[visitorId].utm,
        });
        return { duplicateUpdate: record.duplicateUpdate };
      });

      return sendJson(res, 200, { ok: true, ...result }, withCookies());
    }

    if (pathname === "/api/admin/login" && req.method === "POST") {
      const body = await readBody(req);
      if (!safeEqual(body.password || "", ADMIN_PASSWORD)) {
        return sendJson(res, 401, { error: "unauthorized" });
      }
      const token = randomUUID();
      sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": cookie("godeata_admin", token),
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (pathname === "/api/admin/logout" && req.method === "POST") {
      const token = cookies.godeata_admin;
      if (token) sessions.delete(token);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": "godeata_admin=; Path=/; Max-Age=0",
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (pathname.startsWith("/api/admin/applications/")) {
      if (!isAdmin(req)) return sendJson(res, 401, { error: "unauthorized" });
      const body = await readBody(req);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return sendJson(res, 400, { error: "invalid_body" });
      }
      const now = new Date().toISOString();
      const changeStatus = (db, application, to) => {
        if (application.matchStatus === to) return;
        db.events.push({ type: "match_status_change", applicationEmail: application.email,
          from: application.matchStatus, to, at: now });
        application.matchStatus = to;
      };
      if (pathname === "/api/admin/applications/group" && req.method === "POST") {
        if (!Array.isArray(body.emails) || body.emails.some((email) => typeof email !== "string")) {
          return sendJson(res, 400, { error: "invalid_emails" });
        }
        const emails = [...new Set(body.emails.map(normalizeEmail))];
        if (emails.length < 2 || emails.some((email) => !isKoreaEmail(email))) {
          return sendJson(res, 400, { error: "select_two_applicants" });
        }
        const result = await store.mutate((db) => {
          const apps = emails.map((email) => db.applications.find((a) => a.email === email));
          if (apps.some((a) => !a)) return { status: 404, error: "application_not_found" };
          if (apps.some((a) => a.matchGroupId || a.matchStatus !== "unmatched")) {
            return { status: 409, error: "already_grouped" };
          }
          const matchGroupId = randomUUID();
          for (const a of apps) {
            a.matchGroupId = matchGroupId;
            a.matchedAt = now;
            changeStatus(db, a, "matched");
          }
          return { status: 200, ok: true, matchGroupId };
        });
        return sendJson(res, result.status, result);
      }
      const route = pathname.match(/^\/api\/admin\/applications\/([^/]+)\/(chat-link|fee|mark-payment-requested|mark-paid|mark-no-show|note)$/);
      if (!route || req.method !== (route[2] === "note" ? "PATCH" : "POST")) {
        return sendJson(res, 404, { error: "not_found" });
      }
      let email;
      try { email = normalizeEmail(decodeURIComponent(route[1])); }
      catch { return sendJson(res, 400, { error: "invalid_email" }); }
      const action = route[2];
      if (action === "chat-link") {
        try {
          const link = new URL(body.chatLink);
          if (typeof body.chatLink !== "string" || body.chatLink.length > 2000 ||
              link.protocol !== "https:" || link.hostname !== "open.kakao.com" || link.username || link.password) throw new Error();
        } catch { return sendJson(res, 400, { error: "invalid_chat_link" }); }
      }
      if (action === "fee" && (!Number.isSafeInteger(body.feeAmount) || body.feeAmount < 0)) {
        return sendJson(res, 400, { error: "invalid_fee" });
      }
      if (action === "note" && (typeof body.operatorNote !== "string" || body.operatorNote.length > 10000)) {
        return sendJson(res, 400, { error: "invalid_note" });
      }
      const result = await store.mutate((db) => {
        const a = db.applications.find((entry) => entry.email === email);
        if (!a) return { status: 404, error: "application_not_found" };
        if (action === "note") {
          a.operatorNote = body.operatorNote;
          return { status: 200, ok: true };
        }
        if (!a.matchGroupId) return { status: 409, error: "group_required" };
        if (action === "chat-link" || action === "fee") {
          const field = action === "fee" ? "feeAmount" : "chatLink";
          for (const member of db.applications.filter((entry) => entry.matchGroupId === a.matchGroupId)) {
            member[field] = body[field];
          }
          return { status: 200, ok: true };
        }
        const transitions = {
          "mark-payment-requested": { from: ["matched"], to: "payment_requested", field: "paymentRequestedAt" },
          "mark-paid": { from: ["payment_requested"], to: "paid", field: "paidAt" },
          "mark-no-show": { from: ["matched", "payment_requested", "paid"], to: "no_show" },
        };
        const transition = transitions[action];
        if (a.matchStatus === transition.to) return { status: 200, ok: true };
        if (!transition.from.includes(a.matchStatus)) return { status: 409, error: "invalid_transition" };
        if (action === "mark-payment-requested" && a.feeAmount === null) {
          return { status: 409, error: "fee_required" };
        }
        changeStatus(db, a, transition.to);
        if (transition.field) a[transition.field] = now;
        return { status: 200, ok: true };
      });
      return sendJson(res, result.status, result);
    }

    if (pathname === "/api/admin/stats" && req.method === "GET") {
      if (!isAdmin(req)) return sendJson(res, 401, { error: "unauthorized" });
      return sendJson(res, 200, computeStats(store.read((db) => db)));
    }

    if (pathname === "/api/admin/export.csv" && req.method === "GET") {
      if (!isAdmin(req)) return sendJson(res, 401, { error: "unauthorized" });
      const apps = store.read((db) => db.applications);
      const header = [
        "id",
        "name",
        "email",
        "date",
        "timeFrom",
        "timeTo",
        "origin",
        "destination",
        "partySize",
        "flexible",
        "consentNews",
        "createdAt",
        "updatedAt",
      ];
      const lines = [header.join(",")];
      for (const row of apps) {
        lines.push(header.map((k) => csvEscape(row[k])).join(","));
      }
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=godeata-applications.csv",
      });
      res.end("\uFEFF" + lines.join("\n"));
      return;
    }

    if (req.method === "GET" && !pathname.startsWith("/api/")) {
      return serveStatic(req, res, pathname, withCookies());
    }

    sendJson(res, 404, { error: "not_found" });
  } catch (err) {
    if (err.message === "invalid_json") {
      return sendJson(res, 400, { error: "invalid_json" });
    }
    console.error(err);
    sendJson(res, 500, { error: "server_error" });
  }
});

server.listen(PORT, () => {
  console.log(`${SERVICE_NAME} landing http://localhost:${PORT}`);
  console.log(`Admin http://localhost:${PORT}/admin.html`);
});
