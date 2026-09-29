// Paste this below your existing SHEET_ID and SUBMISSION_TOKEN constants in Apps Script.
const APPLICATION_HEADERS = ["신청 시각", "이름", "연락처", "날짜·구간", "출발 희망 시간", "출발지", "도착지", "개인정보 동의", "UTM"];
const EVENT_HEADERS = ["기록 시각", "이벤트", "방문자 ID", "UTM", "메타데이터"];

function getOrCreateSheet(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  return sheet;
}
function rowsFrom(sheet, columns) {
  return sheet && sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, columns).getValues() : [];
}
function parseObject(value) { try { return JSON.parse(value || "{}"); } catch (_) { return {}; } }
function countItems(values) {
  const counts = {};
  values.filter(Boolean).forEach((value) => { const key = String(value); counts[key] = (counts[key] || 0) + 1; });
  return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
function eventVisitors(rows, event) {
  return new Set(rows.filter((row) => row[1] === event).map((row) => String(row[2] || "")).filter(Boolean));
}
function operations(spreadsheet) {
  const sheet = getOrCreateSheet(spreadsheet, "운영지표", ["지표", "값"]);
  if (sheet.getLastRow() === 1) sheet.getRange(2, 1, 4, 2).setValues([["매칭 완료 신청", 0], ["취소 신청", 0], ["노쇼", 0], ["재이용", 0]]);
  const data = rowsFrom(sheet, 2); const values = {};
  data.forEach((row) => { values[String(row[0])] = Number(row[1]) || 0; });
  return { matchedApplications: values["매칭 완료 신청"] || 0, cancelledApplications: values["취소 신청"] || 0, noShows: values["노쇼"] || 0, repeatRiders: values["재이용"] || 0 };
}
function analyticsStats(spreadsheet) {
  const eventRows = rowsFrom(spreadsheet.getSheetByName("분석"), 5);
  const applicationRows = rowsFrom(spreadsheet.getSheets()[0], 9);
  const preorderRows = rowsFrom(spreadsheet.getSheetByName("사전예약"), 9);
  const visitors = new Set(eventRows.map((row) => String(row[2] || "")).filter(Boolean));
  const contacts = applicationRows.map((row) => String(row[2] || "").trim()).filter(Boolean);
  const contactCounts = countItems(contacts); const repeatApplicants = contactCounts.filter((item) => item.count > 1).length;
  const channelMap = {};
  eventRows.forEach((row) => {
    const source = String(parseObject(row[3]).utm_source || "직접 유입"); const id = String(row[2] || "");
    if (!channelMap[source]) channelMap[source] = { label: source, visitorIds: new Set(), submitIds: new Set() };
    if (id) channelMap[source].visitorIds.add(id); if (row[1] === "application_submit_success") channelMap[source].submitIds.add(id);
  });
  return {
    ok: true,
    uniqueVisitors: visitors.size,
    freeTrialClicks: eventVisitors(eventRows, "free_trial_click").size,
    preorderClicks: eventVisitors(eventRows, "preorder_click").size,
    formStarts: eventVisitors(eventRows, "form_start").size,
    applicationSubmits: eventVisitors(eventRows, "application_submit_success").size,
    preorderFormStarts: eventVisitors(eventRows, "preorder_form_start").size,
    preorderSubmits: eventVisitors(eventRows, "preorder_submit_success").size,
    applicationsTotal: applicationRows.length,
    preordersTotal: preorderRows.length,
    uniqueApplicants: new Set(contacts).size,
    repeatApplicants,
    routes: countItems(applicationRows.map((row) => row[3])),
    timeSlots: countItems(applicationRows.map((row) => row[4])),
    channels: Object.values(channelMap).map((item) => ({ label: item.label, visitors: item.visitorIds.size, submits: item.submitIds.size })).sort((a, b) => b.visitors - a.visitors),
    operations: operations(spreadsheet),
  };
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    if (data.token !== SUBMISSION_TOKEN) return json({ ok: false, error: "unauthorized" });
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    if (data.action === "track") {
      getOrCreateSheet(spreadsheet, "분석", EVENT_HEADERS).appendRow([new Date(), data.event || "", data.visitorId || "", JSON.stringify(data.utm || {}), JSON.stringify(data.meta || {})]);
      return json({ ok: true });
    }
    if (data.action === "analytics_stats") return json(analyticsStats(spreadsheet));
    const sheet = data.recordType === "preorder" ? getOrCreateSheet(spreadsheet, "사전예약", APPLICATION_HEADERS) : spreadsheet.getSheets()[0];
    sheet.appendRow([new Date(), data.name || "", data.contact || "", data.trip || data.date || "", data.timeSlot || data.timeFrom || "", data.origin || "", data.destination || "", data.consentRequired ? "동의" : "미동의", JSON.stringify(data.utm || {})]);
    return json({ ok: true });
  } catch (error) { return json({ ok: false, error: String(error) }); }
}
function doGet() { return json({ ok: true, service: "Modu Taxi" }); }
function json(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }