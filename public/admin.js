const login = document.getElementById("login");
const dash = document.getElementById("dash");
const loginError = document.getElementById("login-error");
const operationStatus = document.getElementById("operation-status");
const statuses = { unmatched: "미매칭", matched: "매칭 완료", payment_requested: "결제요청", paid: "입금 확인", no_show: "노쇼" };
let saving = Promise.resolve();

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function chatAnchor(link) {
  try {
    const url = new URL(link);
    if (url.protocol === "https:" && url.hostname === "open.kakao.com") {
      return `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">카톡방 열기</a>`;
    }
  } catch {}
  return "-";
}

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function render(stats) {
  document.getElementById("metrics").innerHTML = `
    <div class="metric"><b>${stats.uniqueVisitors}</b><span>고유 방문자</span></div>
    <div class="metric"><b>${stats.ctaUnique}</b><span>CTA 클릭 고유 방문자</span></div>
    <div class="metric"><b>${pct(stats.ctaRate)}</b><span>CTA 클릭률 = CTA 고유 / 방문 고유</span></div>
    <div class="metric"><b>${pct(stats.applyRate)}</b><span>신청 전환율 = 제출 고유 / 방문 고유</span></div>
    <div class="metric"><b>${stats.formStartUnique}</b><span>폼 시작 고유</span></div>
    <div class="metric"><b>${stats.submitUnique}</b><span>제출 성공 고유 방문자</span></div>
    <div class="metric"><b>${stats.uniqueApplicants}</b><span>고유 신청자 (이메일)</span></div>
    <div class="metric"><b>${stats.figmaUnique}</b><span>피그마 미리보기 고유</span></div>
    <div class="metric"><b>${pct(stats.matchRate)}</b><span>매칭 성사율 · ${stats.matchedUnique} / ${stats.uniqueApplicants}명</span></div>
    <div class="metric"><b>${pct(stats.paymentConversionRate)}</b><span>결제 전환율 · 입금 ${stats.paidUnique} / 요청 ${stats.paymentRequestedUnique}명</span></div>
  `;

  document.getElementById("channels").innerHTML = stats.channels
    .map(
      (c) => `<tr>
        <td>${escapeHtml(c.utm_source)}</td>
        <td>${c.uniqueVisitors}</td>
        <td>${c.ctaUnique}</td>
        <td>${pct(c.ctaRate)}</td>
        <td>${c.submitUnique}</td>
        <td>${pct(c.applyRate)}</td>
      </tr>`
    )
    .join("");

  document.getElementById("apps").innerHTML = stats.applications
    .map((a) => {
      const raw = a;
      a = Object.fromEntries(Object.entries(a).map(([key, value]) => [key, typeof value === "string" ? escapeHtml(value) : value]));
      const time = a.timeTo ? `${a.timeFrom}–${a.timeTo}` : a.timeFrom;
      return `<tr data-email="${a.email}">
        <td><input type="checkbox" data-select aria-label="${a.email} 선택" ${a.matchGroupId ? "disabled" : ""} /></td>
        <td>${a.email}</td>
        <td>${a.name}</td>
        <td>${a.date}</td>
        <td>${time}</td>
        <td>${a.origin} → ${a.destination}</td>
        <td>${a.partySize}</td>
        <td>${a.flexible ? "가능" : "어려움"}</td>
        <td>${a.consentNews ? "동의" : "-"}</td>
        <td>${a.updatedAt.replace("T", " ").slice(0, 16)}</td>
        <td>${statuses[a.matchStatus] || a.matchStatus}
          ${[["매칭", a.matchedAt], ["결제요청", a.paymentRequestedAt], ["입금", a.paidAt]].filter(([, at]) => at).map(([label, at]) => `<small style="display:block;white-space:nowrap">${label}: ${escapeHtml(new Date(at).toLocaleString("ko-KR"))}</small>`).join("")}
        </td>
        <td>${a.matchGroupId || "-"}</td>
        <td>${chatAnchor(raw.chatLink)}</td>
        <td>${a.feeAmount === null ? "-" : `${a.feeAmount.toLocaleString()}원`}</td>
        <td><textarea data-note aria-label="${a.email} 운영자 메모" maxlength="10000">${a.operatorNote}</textarea><small data-note-status></small></td>
        <td>
          <button class="btn ghost" data-action="mark-payment-requested" ${a.matchStatus !== "matched" || a.feeAmount === null ? "disabled" : ""}>결제요청 표시</button>
          <button class="btn ghost" data-action="mark-paid" ${a.matchStatus !== "payment_requested" ? "disabled" : ""}>입금 확인</button>
          <button class="btn ghost" data-action="mark-no-show" ${["matched", "payment_requested", "paid"].includes(a.matchStatus) ? "" : "disabled"}>노쇼 표시</button>
        </td>
      </tr>`;
    })
    .join("");
  const groups = new Map();
  for (const a of stats.applications) {
    if (!a.matchGroupId) continue;
    if (!groups.has(a.matchGroupId)) groups.set(a.matchGroupId, []);
    groups.get(a.matchGroupId).push(a);
  }
  document.getElementById("groups").innerHTML = [...groups].map(([id, members]) => {
    const a = members[0];
    return `<section class="metric" data-email="${escapeHtml(a.email)}">
      <strong>그룹 ${escapeHtml(id)}</strong>
      <p>${members.map((member) => escapeHtml(member.email)).join(", ")}</p>
      <label>카톡 오픈채팅 링크 <input data-chat type="url" value="${escapeHtml(a.chatLink)}" placeholder="https://open.kakao.com/…" /></label>
      <button class="btn ghost" data-action="chat-link">링크 저장</button><br />
      <label>1인 요청 금액 (원) <input data-fee type="number" min="0" step="1" value="${a.feeAmount ?? ""}" /></label>
      <button class="btn ghost" data-action="fee">금액 저장</button>
    </section>`;
  }).join("");
}

const errors = {
  unauthorized: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
  already_grouped: "이미 그룹에 속한 신청자가 있습니다. 새로고침 후 확인해 주세요.",
  select_two_applicants: "미매칭 신청자를 두 명 이상 선택해 주세요.",
  invalid_chat_link: "https://open.kakao.com/ 형식의 오픈채팅 링크를 입력해 주세요.",
  invalid_fee: "금액은 0 이상의 정수로 입력해 주세요.",
  invalid_transition: "현재 상태에서 처리할 수 없습니다. 새로고침 후 확인해 주세요.",
  fee_required: "그룹 금액을 먼저 저장해 주세요.",
  group_required: "먼저 그룹을 생성해 주세요.",
  application_not_found: "신청자를 찾을 수 없습니다.",
};

async function updateApplication(path, body, method = "POST") {
  const res = await fetch(`/api/admin/applications/${path}`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  });
  const result = await res.json();
  if (res.status === 401) { dash.hidden = true; login.hidden = false; }
  if (!res.ok) throw new Error(errors[result.error] || "저장하지 못했습니다. 입력값과 연결을 확인해 주세요.");
}

document.getElementById("apps").addEventListener("focusout", (event) => {
  const input = event.target.closest("[data-note]");
  if (!input || input.value === input.defaultValue) return;
  const row = input.closest("[data-email]");
  const value = input.value;
  const label = row.querySelector("[data-note-status]");
  label.textContent = "저장 중…";
  saving = saving.then(async () => {
    try {
      await updateApplication(`${encodeURIComponent(row.dataset.email)}/note`, { operatorNote: value }, "PATCH");
      input.defaultValue = value;
      label.textContent = "저장됨";
      return true;
    } catch (error) {
      label.textContent = error.message + " 메모를 다시 선택한 뒤 나가면 재시도합니다.";
      return false;
    }
  });
});

dash.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action], #create-group");
  if (!button || button.disabled) return;
  const row = button.closest("[data-email]");
  const action = button.dataset.action;
  const body = {};
  let path;
  if (button.id === "create-group") {
    path = "group";
    body.emails = [...document.querySelectorAll("[data-select]:checked")].map((input) => input.closest("[data-email]").dataset.email);
  } else {
    path = `${encodeURIComponent(row.dataset.email)}/${action}`;
    if (action === "chat-link") body.chatLink = row.querySelector("[data-chat]").value.trim();
    if (action === "fee") {
      const value = row.querySelector("[data-fee]").value;
      body.feeAmount = value.trim() === "" ? null : Number(value);
    }
  }
  button.disabled = true;
  operationStatus.textContent = "저장 중…";
  try {
    await saving;
    if ([...document.querySelectorAll("[data-note]")].some((input) => input.value !== input.defaultValue)) {
      throw new Error("저장하지 못한 메모가 있습니다. 메모를 먼저 저장해 주세요.");
    }
    await updateApplication(path, body);
    await loadStats();
    operationStatus.className = "status ok";
    operationStatus.textContent = "기록을 저장했습니다.";
  } catch (error) {
    operationStatus.className = "status err";
    operationStatus.textContent = error.message;
  } finally { button.disabled = false; }
});

async function loadStats() {
  const res = await fetch("/api/admin/stats");
  if (res.status === 401) {
    dash.hidden = true;
    login.hidden = false;
    return false;
  }
  if (!res.ok) throw new Error("통계를 불러오지 못했습니다. 다시 시도해 주세요.");
  const stats = await res.json();
  login.hidden = true;
  dash.hidden = false;
  render(stats);
  return true;
}

login.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const password = document.getElementById("password").value;
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    loginError.textContent = "비밀번호가 올바르지 않습니다.";
    return;
  }
  await loadStats();
});

document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  location.reload();
});

loadStats().catch((error) => { loginError.textContent = error.message; });
